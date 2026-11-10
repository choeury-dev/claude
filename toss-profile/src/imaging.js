// 캔버스 작업: 품질 측정용 축소, 업로드용 압축, 명언 글귀 합성, 미리보기 워터마크
import { analyzePixels } from '../shared/quality.js';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 열 수 없어요'));
    img.src = src;
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** 해상도·밝기·흔들림 측정 */
export async function measure(dataUrl) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight)); // LIMITS.minSharpness 기준 크기
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return analyzePixels({ width: w, height: h, data }, { width: img.naturalWidth, height: img.naturalHeight });
}

/** 서버로 보내기 전에 긴 변 1280px JPEG 로 줄인다 (전송량·토큰 절약) */
export async function compress(dataUrl, maxSide = 1280) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

const TITLE_FONT = '"Nanum Myeongjo", "Noto Serif KR", serif';
const BODY_FONT = '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

/** 명언 템플릿: 오른쪽에 글귀 패널을 그린다 */
export async function composeQuote(dataUrl, overlay, size = 1080) {
  const img = await loadImage(dataUrl);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  // 정사각형으로 가운데 자르기
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const px = size * 0.55, pw = size * 0.42, py = size * 0.05, ph = size * 0.9;
  ctx.fillStyle = 'rgba(255, 252, 245, 0.88)';
  roundRect(ctx, px, py, pw, ph, size * 0.03);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = py + size * 0.05;
  ctx.fillStyle = overlay.accent || '#c0392b';
  ctx.font = `800 ${Math.round(size * 0.075)}px ${TITLE_FONT}`;
  for (const line of overlay.title.split('\n')) {
    ctx.fillText(line, px + pw / 2, y);
    y += size * 0.09;
  }
  y += size * 0.02;

  const bodySize = Math.round(size * 0.04);
  overlay.lines.forEach((text, i) => {
    const [first, ...rest] = text.split('\n');
    ctx.fillStyle = '#222';
    ctx.font = `600 ${bodySize}px ${BODY_FONT}`;
    ctx.fillText(`${i + 1}. ${first}`, px + pw / 2, y);
    y += bodySize * 1.35;
    ctx.fillStyle = overlay.accent || '#c0392b';
    ctx.font = `800 ${bodySize}px ${BODY_FONT}`;
    for (const r of rest) { ctx.fillText(r, px + pw / 2, y); y += bodySize * 1.35; }
    y += bodySize * 0.8;
  });
  return c.toDataURL('image/jpeg', 0.92);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 저장 전 미리보기용 워터마크 */
export async function watermark(dataUrl) {
  const img = await loadImage(dataUrl);
  const c = canvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `800 ${Math.round(c.width * 0.08)}px ${BODY_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.textAlign = 'center';
  for (let i = -2; i <= 2; i++) {
    ctx.fillText('미리보기', 0, i * c.height * 0.25);
    ctx.strokeText('미리보기', 0, i * c.height * 0.25);
  }
  ctx.restore();
  return c.toDataURL('image/jpeg', 0.7);
}
