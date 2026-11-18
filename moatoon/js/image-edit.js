// 완성 그림 편집: 배경 채우기(인물·말풍선 지우기), 캐릭터 레이어 오려 내기, 표정 바꾸기.
// 그림 자체는 OpenAI 이미지 편집 API 가 그리고, 여기서는 캔버스로 위치 맞추기와 합성을 한다.
//
// 원칙: 원본을 최대한 지킨다.
//  - 배경 채우기: AI 결과 중 "지운 영역" 안쪽만 가져다 원본 위에 부드럽게 붙인다. 영역 밖은 원본 픽셀 그대로.
//  - 캐릭터 오려 내기: AI 에게서는 윤곽(투명도)만 받고, 색·선은 원본 픽셀을 쓴다.
//  - 표정 바꾸기: 얼굴 영역만 고치게 마스크를 주고, 얼굴 밖은 원래 레이어 그대로.
// AI 결과는 표준 크기(1024·1536)로 오므로, 보낼 때 여백을 붙여(레터박스) 비율을 맞추고 돌려받은 뒤 되돌린다.

import { editImage, STANDARD_SIZES } from './openai-image.js';

export const loadImg = (url) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('이미지를 읽지 못했습니다.'));
  i.src = url;
});
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));

export function pickSize(w, h) {
  const a = w / h;
  let best = STANDARD_SIZES[0], bd = Infinity;
  for (const s of STANDARD_SIZES) { const d = Math.abs(Math.log(s[0] / s[1] / a)); if (d < bd) { bd = d; best = s; } }
  return best;
}

export function clampRect(r, W, H) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.max(1, Math.min(W, Math.ceil(r.x + r.w)) - x), h: Math.max(1, Math.min(H, Math.ceil(r.y + r.h)) - y) };
}
export function expandRect(r, k, W, H) {
  const dx = r.w * k, dy = r.h * k;
  return clampRect({ x: r.x - dx, y: r.y - dy, w: r.w + dx * 2, h: r.h + dy * 2 }, W, H);
}

// 원본의 src 영역을 표준 크기 캔버스 가운데에 맞춰 그린다
export function letterbox(img, src, bg) {
  const [W, H] = pickSize(src.w, src.h);
  const scale = Math.min(W / src.w, H / src.h);
  const ox = (W - src.w * scale) / 2, oy = (H - src.h * scale) / 2;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(img, src.x, src.y, src.w, src.h, ox, oy, src.w * scale, src.h * scale);
  return { canvas: c, W, H, scale, ox, oy, src };
}
// 고칠 곳(rects, 원본 좌표)만 투명한 마스크
export function maskFor(lb, rects) {
  const c = makeCanvas(lb.W, lb.H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, lb.W, lb.H);
  ctx.globalCompositeOperation = 'destination-out';
  for (const r of rects) ctx.fillRect(lb.ox + (r.x - lb.src.x) * lb.scale, lb.oy + (r.y - lb.src.y) * lb.scale, r.w * lb.scale, r.h * lb.scale);
  return c;
}
// AI 결과(표준 크기)를 원래 영역 크기로 되돌린다
export function unletterbox(resultImg, lb) {
  const c = makeCanvas(lb.src.w, lb.src.h);
  const sx = resultImg.naturalWidth / lb.W, sy = resultImg.naturalHeight / lb.H; // 혹시 다른 크기로 와도 비율로 맞춘다
  c.getContext('2d').drawImage(resultImg, lb.ox * sx, lb.oy * sy, lb.src.w * lb.scale * sx, lb.src.h * lb.scale * sy, 0, 0, lb.src.w, lb.src.h);
  return c;
}
// overlay 를 rects 안쪽만, 가장자리를 부드럽게 해서 base 위에 붙인다
export function pasteInRects(base, overlay, rects, feather) {
  const W = base.width, H = base.height;
  const m = makeCanvas(W, H);
  const mc = m.getContext('2d');
  if ('filter' in mc) mc.filter = `blur(${feather}px)`;
  mc.fillStyle = '#fff';
  for (const r of rects) mc.fillRect(r.x + feather, r.y + feather, r.w - feather * 2, r.h - feather * 2);
  const o = makeCanvas(W, H);
  const oc = o.getContext('2d');
  oc.drawImage(overlay, 0, 0);
  oc.globalCompositeOperation = 'destination-in';
  oc.drawImage(m, 0, 0);
  base.getContext('2d').drawImage(o, 0, 0);
  return base;
}
function transparentRatio(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let t = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 16) t++;
  return t / (d.length / 16);
}

const STYLE = 'Keep the exact same art style: hand-drawn colored pencil / crayon texture, soft pastel colors, the same outline thickness.';

// ① 배경 채우기: rects(원본 좌표) 안의 인물·말풍선을 지우고 주변 배경으로 채운다
export async function fillBackground({ cfg, imgUrl, rects }) {
  const img = await loadImg(imgUrl);
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  const lb = letterbox(img, full, '#ffffff');
  const prompt = `Remove everything inside the transparent areas of the mask (characters, speech bubbles, text) and repaint those areas so the background continues naturally from the surroundings (walls, windows, desk, objects). Do not add any characters, people, animals, text or speech bubbles. Leave every pixel outside the masked areas unchanged. ${STYLE}`;
  const out = await editImage({ ...cfg, prompt, images: [await toBlob(lb.canvas)], mask: await toBlob(maskFor(lb, rects)), size: `${lb.W}x${lb.H}` });
  const back = unletterbox(await loadImg(out), lb);
  const base = makeCanvas(full.w, full.h);
  base.getContext('2d').drawImage(img, 0, 0);
  pasteInRects(base, back, rects, 10);
  return { url: base.toDataURL('image/png'), w: full.w, h: full.h };
}

// ② 캐릭터 오려 내기: AI 에게 윤곽만 받아 원본 픽셀에 입힌다
export async function cutOutCharacter({ cfg, imgUrl, rect, name, keepOriginalPixels = true }) {
  const img = await loadImg(imgUrl);
  const src = clampRect(rect, img.naturalWidth, img.naturalHeight);
  const lb = letterbox(img, src, '#ffffff');
  const prompt = `Cut out the main character${name ? ` (${name})` : ''} from this picture. Keep only that character exactly as drawn: same pose, same position, same size, same outline and colors. Make everything else fully transparent, including the background, furniture and other characters. Do not redraw, move, resize or restyle the character. ${STYLE}`;
  const out = await editImage({ ...cfg, prompt, images: [await toBlob(lb.canvas)], size: `${lb.W}x${lb.H}`, background: 'transparent' });
  const alpha = unletterbox(await loadImg(out), lb);
  const ratio = transparentRatio(alpha);
  if (ratio < 0.02) throw new Error('배경이 투명하게 오지 않았습니다. 설정에서 다른 이미지 모델을 골라 다시 해 보세요.');
  if (!keepOriginalPixels) return { url: alpha.toDataURL('image/png'), w: src.w, h: src.h };
  const c = makeCanvas(src.w, src.h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(alpha, 0, 0);
  return { url: c.toDataURL('image/png'), w: src.w, h: src.h };
}

// ③ 표정 바꾸기: 두 번째 이미지(등록한 표정)를 참고해 얼굴만 고친다
export async function changeExpression({ cfg, layerUrl, refUrl, emotionLabel, name, faceOnly = true, face }) {
  const layer = await loadImg(layerUrl);
  const full = { x: 0, y: 0, w: layer.naturalWidth, h: layer.naturalHeight };
  const lb = letterbox(layer, full, null);
  const ref = await loadImg(refUrl);
  const refLb = letterbox(ref, { x: 0, y: 0, w: ref.naturalWidth, h: ref.naturalHeight }, '#ffffff');
  const faceRect = face || { x: full.w * 0.1, y: 0, w: full.w * 0.8, h: full.h * 0.5 };
  const prompt = `Edit the first image. Change the facial expression of the character${name ? ` (${name})` : ''} to match the expression in the second image${emotionLabel ? ` ("${emotionLabel}")` : ''}: eyes, eyebrows, mouth, blush and small sweat or tear marks. ${faceOnly ? 'Only change the face; keep the pose, hands, body, clothes and accessories exactly the same.' : 'You may adjust the pose and hands to match the second image, but keep the same character design, clothes and accessories.'} Keep the transparent background. Do not add text. ${STYLE}`;
  const out = await editImage({
    ...cfg, prompt,
    images: [await toBlob(lb.canvas), await toBlob(refLb.canvas)],
    mask: faceOnly ? await toBlob(maskFor(lb, [faceRect])) : null,
    size: `${lb.W}x${lb.H}`, background: 'transparent',
  });
  const back = unletterbox(await loadImg(out), lb);
  if (!faceOnly) return { url: back.toDataURL('image/png'), w: full.w, h: full.h };
  const base = makeCanvas(full.w, full.h);
  base.getContext('2d').drawImage(layer, 0, 0);
  // 얼굴 영역의 원래 그림을 비우고 새 얼굴을 붙인다(겹쳐 보이지 않게)
  const bctx = base.getContext('2d');
  const inner = expandRect(faceRect, -0.08, full.w, full.h);
  bctx.save(); bctx.globalCompositeOperation = 'destination-out'; bctx.fillRect(inner.x, inner.y, inner.w, inner.h); bctx.restore();
  pasteInRects(base, back, [faceRect], 6);
  return { url: base.toDataURL('image/png'), w: full.w, h: full.h };
}
