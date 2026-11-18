// Claude 로 맞춤법·사실 확인을 한 번 더 한다 (선택 기능).
// API 키는 이 브라우저의 localStorage 에만 저장되고, 요청은 브라우저에서 Anthropic API 로 바로 간다.
// 그래서 공용 컴퓨터나 남에게 배포하는 사이트에서는 쓰지 말 것.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'suggestion', 'spellingNote', 'factVerdict', 'factNote'],
        properties: {
          id: { type: 'string' },
          suggestion: { type: 'string', description: '맞춤법·띄어쓰기·사실을 고친 권장 문장. 고칠 것이 없으면 원문 그대로.' },
          spellingNote: { type: 'string', description: '무엇을 왜 고쳤는지 한두 문장. 없으면 빈 문자열.' },
          factVerdict: { type: 'string', enum: ['none', 'ok', 'doubtful', 'false', 'unverifiable'] },
          factNote: { type: 'string', description: '사실 판단의 근거. 확실하지 않으면 그렇다고 쓴다. 없으면 빈 문자열.' },
        },
      },
    },
  },
};

const SYSTEM = `너는 한국어 웹툰 대사 교정자다.
각 대사의 맞춤법과 띄어쓰기를 한글 맞춤법·표준어 규정·외래어 표기법 기준으로 고친다.
말투, 유행어, 의성어, 캐릭터 개성은 바꾸지 않는다. 틀린 곳만 고친다.
대사에 사실 주장(숫자, 연도, 역사, 과학, '최초' 등)이 있으면 factVerdict 로 판단한다:
none = 사실 주장 없음, ok = 맞음, doubtful = 의심스러움, false = 틀림, unverifiable = 판단할 근거가 부족함.
너는 인터넷을 검색하지 않는다. 확실하지 않으면 ok 나 false 대신 doubtful 이나 unverifiable 을 쓴다.
사실이 틀렸거나 의심스러우면 suggestion 에서 사실에 맞게 고치거나 '~라는 말이 있대'처럼 전해 들은 말로 바꾼다.`;

export async function aiCheck(apiKey, lines) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const payload = lines.map((l) => ({ id: l.id, speaker: l.speaker || '', kind: l.kind, text: l.text }));
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `다음 대사들을 검사해 줘.\n${JSON.stringify(payload, null, 2)}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 요청을 처리하지 않았습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error('응답이 너무 길어 잘렸습니다. 대사를 나눠서 검사해 주세요.');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('응답에 결과가 없습니다.');
  return JSON.parse(textBlock.text).items;
}

export function describeError(err) {
  const s = err && (err.status || err.statusCode);
  if (s === 401) return 'API 키가 맞지 않습니다. 키를 다시 확인해 주세요.';
  if (s === 429) return '요청이 많아 잠시 막혔습니다. 조금 뒤에 다시 시도해 주세요.';
  if (s === 400) return `요청 형식 오류: ${err.message}`;
  if (s >= 500) return 'Anthropic 서버 오류입니다. 잠시 뒤 다시 시도해 주세요.';
  if (err instanceof TypeError) return '네트워크에 연결할 수 없습니다. 이 페이지를 로컬 서버(README 참고)에서 열었는지 확인해 주세요.';
  return err && err.message ? err.message : String(err);
}

// ── 캐릭터 이미지 활용 가이드 ──────────────────────────────────────────
// Claude 는 이미지를 새로 그리지 않는다. 원본을 그대로 두고 앱이 할 수 있는 변형
// (자르기·좌우 반전·살짝 기울이기·스티커 외곽선·그림자·배경 판)만 고르게 해서 캐릭터가 훼손되지 않게 한다.
const GUIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keep', 'avoid', 'palette', 'faceBox', 'usages', 'tips'],
  properties: {
    summary: { type: 'string', description: '캐릭터 인상과 특징을 한두 문장으로' },
    keep: { type: 'array', items: { type: 'string' }, description: '어떤 변형에서도 지켜야 할 고유 특징(얼굴형, 색, 소품 등)' },
    avoid: { type: 'array', items: { type: 'string' }, description: '하면 캐릭터가 훼손되는 처리' },
    palette: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['hex', 'name', 'use'], properties: { hex: { type: 'string' }, name: { type: 'string' }, use: { type: 'string', description: '이 색을 어디에 쓰면 좋은지(말풍선, 배경, 강조 등)' } } },
    },
    faceBox: {
      type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'],
      description: '얼굴(머리) 영역. 이미지 가로·세로에 대한 비율 0~1. 왼쪽 위가 0,0',
      properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
    },
    usages: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'when', 'emotion', 'transform'],
        properties: {
          title: { type: 'string' },
          when: { type: 'string', description: '어떤 장면·페이지에서 쓰면 좋은지' },
          emotion: { type: 'string', enum: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'embarrassed', 'love', 'tired', 'annoyed', 'blank'], description: '이 이미지가 실제로 보여 주는 표정. 이미지와 다른 표정을 지어내지 않는다' },
          transform: {
            type: 'object', additionalProperties: false,
            required: ['crop', 'flip', 'rotate', 'outline', 'shadow', 'plate', 'plateColor'],
            properties: {
              crop: { type: 'string', enum: ['full', 'bust', 'face'] },
              flip: { type: 'boolean' },
              rotate: { type: 'number', description: '-12 ~ 12 도 사이' },
              outline: { type: 'boolean', description: '흰 외곽선(스티커 느낌). 배경이 투명한 이미지에서만 의미가 있다' },
              shadow: { type: 'boolean' },
              plate: { type: 'string', enum: ['none', 'circle', 'rounded'] },
              plateColor: { type: 'string', description: '#rrggbb' },
            },
          },
        },
      },
    },
    tips: { type: 'array', items: { type: 'string' }, description: '컷 안 배치·구도·말풍선 위치 팁' },
  },
};

const GUIDE_SYSTEM = `너는 인스타그램 모아툰(여러 컷을 한 장에 모은 만화) 아트 디렉터다.
사용자가 올린 캐릭터 이미지를 보고, 캐릭터를 훼손하지 않는 범위에서 활용법을 제안한다.
쓸 수 있는 처리는 이것뿐이다: 자르기(full 전신, bust 상반신, face 얼굴), 좌우 반전, -12~12도 기울이기, 흰 외곽선, 그림자, 원형/둥근 사각 배경 판.
비율 바꾸기, 색 바꾸기, 표정·포즈 새로 그리기는 할 수 없고 제안하지도 않는다.
글자나 로고가 있는 캐릭터는 반전하면 글자가 뒤집히니 반전을 제안하지 않는다.
usages 는 서로 다른 쓰임새로 4~6개. 한국어로 짧고 구체적으로 쓴다.`;

async function shrinkForApi(url, maxSide = 1024) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png').split(',')[1];
}

export async function aiCharacterGuide(apiKey, imageUrl, name) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await shrinkForApi(imageUrl);
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: GUIDE_SCHEMA } },
    system: GUIDE_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data } },
        { type: 'text', text: `캐릭터 이름: ${name || '(이름 없음)'}\n이 캐릭터의 활용 가이드를 만들어 줘.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 이미지를 처리하지 않았습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error('응답이 너무 길어 잘렸습니다. 다시 시도해 주세요.');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('응답에 결과가 없습니다.');
  return sanitizeGuide(JSON.parse(textBlock.text));
}

// 모델이 범위를 벗어난 값을 줘도 앱이 망가지지 않게 정리한다
export function sanitizeGuide(g) {
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#ffe066');
  const fb = g.faceBox || {};
  return {
    summary: String(g.summary || ''),
    keep: (g.keep || []).map(String),
    avoid: (g.avoid || []).map(String),
    palette: (g.palette || []).slice(0, 6).map((p) => ({ hex: hex(p.hex), name: String(p.name || ''), use: String(p.use || '') })),
    faceBox: { x: cl(fb.x, 0, 1), y: cl(fb.y, 0, 1), w: cl(fb.w, 0.05, 1), h: cl(fb.h, 0.05, 1) },
    usages: (g.usages || []).slice(0, 8).map((u) => ({
      title: String(u.title || ''), when: String(u.when || ''), emotion: u.emotion || 'neutral',
      transform: {
        crop: ['full', 'bust', 'face'].includes(u.transform?.crop) ? u.transform.crop : 'full',
        flip: !!u.transform?.flip, rotate: cl(u.transform?.rotate, -12, 12),
        outline: !!u.transform?.outline, shadow: !!u.transform?.shadow,
        plate: ['none', 'circle', 'rounded'].includes(u.transform?.plate) ? u.transform.plate : 'none',
        plateColor: hex(u.transform?.plateColor),
      },
    })),
    tips: (g.tips || []).map(String),
    source: 'claude',
  };
}

// API 키 없이 쓰는 기본 제안: 이미지에서 색만 뽑고, 정해진 활용법을 붙인다(AI 판단 아님).
export async function basicGuide(imageUrl, name) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = imageUrl; });
  const c = document.createElement('canvas');
  c.width = 48; c.height = Math.max(1, Math.round((48 * img.naturalHeight) / img.naturalWidth));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i] >> 5, g = px[i + 1] >> 5, b = px[i + 2] >> 5;
    const lum = px[i] + px[i + 1] + px[i + 2];
    if (lum > 735 || lum < 30) continue; // 거의 흰색·검은색(배경, 외곽선)은 뺀다
    const k = (r << 6) | (g << 3) | b;
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += px[i]; e.g += px[i + 1]; e.b += px[i + 2];
    buckets.set(k, e);
  }
  const toHex = (e) => '#' + [e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, '0')).join('');
  const palette = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((e, i) => ({ hex: toHex(e), name: `주요 색 ${i + 1}`, use: i === 0 ? '배경 판, 강조색' : '말풍선 테두리나 포인트' }));
  const main = palette[0]?.hex || '#ffe066';
  const light = (h) => { const n = parseInt(h.slice(1), 16); const m = (v) => Math.round(v + (255 - v) * 0.7).toString(16).padStart(2, '0'); return `#${m(n >> 16)}${m((n >> 8) & 255)}${m(n & 255)}`; };
  return {
    summary: `${name || '캐릭터'} 이미지에서 색을 뽑고 기본 활용법을 붙였습니다. (AI 분석이 아닙니다. Claude 분석은 API 키가 필요합니다.)`,
    keep: ['원본 비율(가로세로)을 바꾸지 않기', '색을 바꾸지 않기'],
    avoid: ['한쪽으로 늘리거나 줄이기', '얼굴 일부만 잘리게 자르기'],
    palette,
    faceBox: { x: 0.2, y: 0.02, w: 0.6, h: 0.4 },
    usages: [
      { title: '전신 그대로', when: '등장 컷, 동작이 중요한 컷', emotion: 'neutral', transform: { crop: 'full', flip: false, rotate: 0, outline: false, shadow: false, plate: 'none', plateColor: main } },
      { title: '마주 보는 방향', when: '대화 상대가 왼쪽에 있을 때', emotion: 'neutral', transform: { crop: 'full', flip: true, rotate: 0, outline: false, shadow: false, plate: 'none', plateColor: main } },
      { title: '상반신 클로즈업', when: '대사가 많은 컷, 감정을 보여 줄 때', emotion: 'neutral', transform: { crop: 'bust', flip: false, rotate: 0, outline: false, shadow: false, plate: 'none', plateColor: main } },
      { title: '얼굴 스티커', when: '표지, 마지막 요약 페이지의 포인트', emotion: 'neutral', transform: { crop: 'face', flip: false, rotate: -6, outline: true, shadow: true, plate: 'none', plateColor: main } },
      { title: '원형 프로필', when: '표지 회차 표시, 등장인물 소개', emotion: 'neutral', transform: { crop: 'face', flip: false, rotate: 0, outline: false, shadow: false, plate: 'circle', plateColor: light(main) } },
    ],
    tips: ['말풍선은 얼굴 위쪽이나 바라보는 방향 앞에 두세요.', '두 인물이 대화하면 서로 마주 보게 한쪽을 반전하세요.'],
    source: 'basic',
  };
}
