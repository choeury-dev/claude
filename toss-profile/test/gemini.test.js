import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFace, generateImage, splitDataUrl } from '../server/gemini.js';

const cfg = { apiKey: 'k', imageModel: 'img-model', checkModel: 'check-model' };
const IMG = 'data:image/jpeg;base64,QUJD';

function fakeFetch(response, seen) {
  return async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, status: 200, statusText: 'OK', json: async () => response };
  };
}

test('이미지 생성 요청 형태와 응답 파싱', async () => {
  const seen = [];
  const out = await generateImage(IMG, 'prompt', cfg, fakeFetch({ candidates: [{ content: { parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'WFla' } }] } }] }, seen));
  assert.equal(out.image, 'data:image/png;base64,WFla');
  assert.match(seen[0].url, /img-model:generateContent$/);
  assert.equal(seen[0].headers['x-goog-api-key'], 'k');
  assert.deepEqual(seen[0].body.generationConfig.responseModalities, ['IMAGE']);
  assert.equal(seen[0].body.contents[0].parts[1].inline_data.data, 'QUJD');
});

test('이미지가 없으면 이유와 함께 실패', async () => {
  await assert.rejects(generateImage(IMG, 'p', cfg, fakeFetch({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }, [])), /IMAGE_SAFETY/);
});

test('얼굴 판정', async () => {
  const r = await checkFace(IMG, cfg, fakeFetch({ candidates: [{ content: { parts: [{ text: '{"faceCount":2}' }] } }] }, []));
  assert.equal(r.faceCount, 2);
});

test('키가 없으면 MOCK', async () => {
  assert.equal((await generateImage(IMG, 'p', { apiKey: '' })).mock, true);
  assert.throws(() => splitDataUrl('not-a-data-url'));
});
