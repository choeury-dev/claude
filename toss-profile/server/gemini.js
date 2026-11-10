// Gemini API 호출. API 키는 서버에만 둔다 (미니앱 번들에 넣으면 누구나 꺼내 쓴다).
// 키가 없으면 MOCK 모드: 얼굴 1개로 판정하고, 입력 사진을 그대로 돌려준다.
import { FACE_CHECK_PROMPT, parseFaceReport } from '../shared/quality.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export function config(env = process.env) {
  return {
    apiKey: env.GEMINI_API_KEY || '',
    imageModel: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    checkModel: env.GEMINI_CHECK_MODEL || 'gemini-2.5-flash',
  };
}

export function splitDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('이미지 형식이 올바르지 않아요'), { status: 400 });
  return { mimeType: m[1], data: m[2] };
}

async function call(cfg, model, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw Object.assign(new Error(`Gemini ${res.status}: ${msg}`), { status: 502 });
  }
  return json;
}

function partsOf(json) {
  return json?.candidates?.[0]?.content?.parts || [];
}

/** 얼굴 판정 → { faceCount, faceAreaRatio, frontal, obstructed } | null */
export async function checkFace(dataUrl, cfg = config(), fetchImpl = fetch) {
  if (!cfg.apiKey) return { faceCount: 1, faceAreaRatio: 0.2, frontal: true, obstructed: false, mock: true };
  const img = splitDataUrl(dataUrl);
  const json = await call(cfg, cfg.checkModel, {
    contents: [{ role: 'user', parts: [{ text: FACE_CHECK_PROMPT }, { inline_data: { mime_type: img.mimeType, data: img.data } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  }, fetchImpl);
  const text = partsOf(json).map((p) => p.text || '').join('');
  return parseFaceReport(text);
}

/** 이미지 편집 → data URL */
export async function generateImage(dataUrl, prompt, cfg = config(), fetchImpl = fetch) {
  if (!cfg.apiKey) return { image: dataUrl, mock: true };
  const img = splitDataUrl(dataUrl);
  const json = await call(cfg, cfg.imageModel, {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: img.mimeType, data: img.data } }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  }, fetchImpl);
  const part = partsOf(json).find((p) => p.inlineData || p.inline_data);
  const out = part && (part.inlineData || part.inline_data);
  if (!out?.data) {
    const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || 'NO_IMAGE';
    throw Object.assign(new Error(`이미지를 만들지 못했어요 (${reason})`), { status: 502, reason });
  }
  return { image: `data:${out.mimeType || out.mime_type || 'image/png'};base64,${out.data}` };
}
