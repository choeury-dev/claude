import { CONFIG } from './platform.js';

async function req(path, body) {
  const res = await fetch(CONFIG.apiBase + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || '잠시 후 다시 시도해 주세요.'), { status: res.status, body: json });
  return json;
}

export const api = {
  quota: (userKey) => req(`/api/quota?userKey=${encodeURIComponent(userKey)}`),
  check: (image) => req('/api/check', { image }),
  generate: (userKey, templateId, image) => req('/api/generate', { userKey, templateId, image }),
  grant: (userKey, orderId) => req('/api/purchase/grant', { userKey, orderId }),
};
