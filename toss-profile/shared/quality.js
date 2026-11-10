// 사진 품질 검사. 화소 계산은 순수 함수라 Node 테스트에서도 돌아간다.
// - 화면(브라우저)에서: 해상도·밝기·흔들림을 계산
// - 서버에서: AI가 얼굴 수·정면 여부·가림 여부를 판단 (faceReport)
// 두 결과를 judgeQuality 로 합쳐 사용자에게 보여줄 안내 문구를 만든다.

export const LIMITS = {
  minShortSide: 480,   // 짧은 변이 이보다 작으면 결과가 뭉개진다
  minBrightness: 55,   // 평균 밝기(0~255)
  maxBrightness: 215,
  minSharpness: 40,    // 라플라시안 분산. 작을수록 흐림. 긴 변 512px 축소본 기준
                       // (예시 사진: 선명 330, 약간 흐림 110, 흐림 29, 많이 흐림 5)
  minFaceArea: 0.04,   // 얼굴이 사진에서 차지하는 비율
};

/** RGBA 배열 → 회색조 Float32Array */
export function toGray({ width, height, data }) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return g;
}

/** 라플라시안 분산(선명도) */
export function sharpness(gray, width, height) {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += v; sumSq += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * @param pixels 축소한 이미지 {width,height,data}
 * @param original 원본 크기 {width,height}
 */
export function analyzePixels(pixels, original = pixels) {
  const gray = toGray(pixels);
  let sum = 0;
  for (const v of gray) sum += v;
  const brightness = gray.length ? sum / gray.length : 0;
  return {
    width: original.width,
    height: original.height,
    shortSide: Math.min(original.width, original.height),
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness(gray, pixels.width, pixels.height)),
  };
}

const MSG = {
  LOW_RES: '사진이 너무 작아요. 원본 사진을 고르거나 새로 찍어 주세요.',
  DARK: '사진이 너무 어두워요. 밝은 곳에서 다시 찍어 주세요.',
  BRIGHT: '빛이 너무 강해 얼굴이 하얗게 날아갔어요. 그늘에서 다시 찍어 주세요.',
  BLURRY: '사진이 흔들렸어요. 휴대폰을 꼭 잡고 다시 찍어 주세요.',
  NO_FACE: '얼굴을 찾지 못했어요. 얼굴이 잘 보이는 사진을 골라 주세요.',
  MANY_FACES: '여러 분이 함께 나왔어요. 한 분만 나온 사진을 골라 주세요.',
  FACE_SMALL: '얼굴이 너무 작게 나왔어요. 가까이에서 찍은 사진을 골라 주세요.',
  NOT_FRONTAL: '얼굴이 옆을 보고 있어요. 정면을 바라본 사진이 좋아요.',
  OBSTRUCTED: '선글라스·마스크·모자나 손에 얼굴이 가려졌어요. 벗고 다시 찍어 주세요.',
  FACE_CHECK_FAILED: '얼굴 확인을 하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

export function messageOf(code) {
  return MSG[code] || '사진을 다시 골라 주세요.';
}

/**
 * @param metrics analyzePixels 결과
 * @param face 서버 응답 { faceCount, faceAreaRatio, frontal, obstructed } | null
 * @returns {{ ok: boolean, problems: {code:string, message:string}[] }}
 */
export function judgeQuality(metrics, face, limits = LIMITS) {
  const codes = [];
  if (metrics) {
    if (metrics.shortSide < limits.minShortSide) codes.push('LOW_RES');
    if (metrics.brightness < limits.minBrightness) codes.push('DARK');
    if (metrics.brightness > limits.maxBrightness) codes.push('BRIGHT');
    if (metrics.sharpness < limits.minSharpness) codes.push('BLURRY');
  }
  if (face === null || face === undefined) {
    codes.push('FACE_CHECK_FAILED');
  } else if (!face.faceCount) {
    codes.push('NO_FACE');
  } else if (face.faceCount > 1) {
    codes.push('MANY_FACES');
  } else {
    if (typeof face.faceAreaRatio === 'number' && face.faceAreaRatio < limits.minFaceArea) codes.push('FACE_SMALL');
    if (face.frontal === false) codes.push('NOT_FRONTAL');
    if (face.obstructed === true) codes.push('OBSTRUCTED');
  }
  return { ok: codes.length === 0, problems: codes.map((code) => ({ code, message: messageOf(code) })) };
}

/** 서버의 얼굴 판정 프롬프트 (JSON만 돌려받는다) */
export const FACE_CHECK_PROMPT = [
  'Look at this photo and answer ONLY with JSON, no prose:',
  '{"faceCount": number of clearly visible human faces,',
  ' "faceAreaRatio": area of the largest face bounding box divided by image area (0..1),',
  ' "frontal": true if the main face looks roughly toward the camera (both eyes visible),',
  ' "obstructed": true if sunglasses, a mask, a hand, a hat brim shadow or hair covers the eyes, nose or mouth}',
].join('\n');

/** 모델 응답 텍스트 → faceReport. 이상하면 null */
export function parseFaceReport(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const faceCount = Number(j.faceCount);
    if (!Number.isFinite(faceCount) || faceCount < 0) return null;
    const ratio = Number(j.faceAreaRatio);
    return {
      faceCount: Math.round(faceCount),
      faceAreaRatio: Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : undefined,
      frontal: typeof j.frontal === 'boolean' ? j.frontal : undefined,
      obstructed: typeof j.obstructed === 'boolean' ? j.obstructed : undefined,
    };
  } catch {
    return null;
  }
}
