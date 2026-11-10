import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createStore } from '../server/store.js';
import { createHandler } from '../server/app.js';

const IMG = 'data:image/jpeg;base64,AAAA';

async function withServer(opts, fn) {
  const store = createStore(null);
  const server = createServer(createHandler({ store, verifyOrder: async () => true, ...opts }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await fn({ base, post }); } finally { server.close(); }
}

const okGemini = { checkFace: async () => ({ faceCount: 1 }), generateImage: async () => ({ image: IMG }) };

test('무료 2장 → 402 → 결제 지급 → 유료 1장', async () => {
  await withServer({ gemini: okGemini }, async ({ post }) => {
    const user = 'user-abc123';
    for (let i = 0; i < 2; i++) assert.equal((await post('/api/generate', { userKey: user, templateId: 'travel_jeju_canola', image: IMG })).status, 200);
    const r3 = await post('/api/generate', { userKey: user, templateId: 'travel_jeju_canola', image: IMG });
    assert.equal(r3.status, 402);
    const g = await (await post('/api/purchase/grant', { userKey: user, orderId: 'o-1' })).json();
    assert.equal(g.granted, true);
    const dup = await (await post('/api/purchase/grant', { userKey: user, orderId: 'o-1' })).json();
    assert.equal(dup.duplicate, true);
    const r4 = await (await post('/api/generate', { userKey: user, templateId: 'travel_jeju_canola', image: IMG })).json();
    assert.equal(r4.kind, 'paid');
    assert.equal(r4.quota.needPayment, true);
  });
});

test('생성이 실패하면 무료 횟수를 돌려준다', async () => {
  const gemini = { ...okGemini, generateImage: async () => { throw Object.assign(new Error('fail'), { status: 502 }); } };
  await withServer({ gemini }, async ({ base, post }) => {
    const r = await post('/api/generate', { userKey: 'user-xyz789', templateId: 'hyodo_money_cake', image: IMG });
    assert.equal(r.status, 502);
    const q = await (await fetch(`${base}/api/quota?userKey=user-xyz789`)).json();
    assert.equal(q.freeLeft, 2);
  });
});

test('확인되지 않은 주문은 지급하지 않는다', async () => {
  await withServer({ gemini: okGemini, verifyOrder: async () => false }, async ({ post }) => {
    assert.equal((await post('/api/purchase/grant', { userKey: 'user-abc123', orderId: 'fake' })).status, 403);
  });
});

test('잘못된 템플릿·사용자 키는 400', async () => {
  await withServer({ gemini: okGemini }, async ({ post }) => {
    assert.equal((await post('/api/generate', { userKey: 'user-abc123', templateId: 'nope', image: IMG })).status, 400);
    assert.equal((await post('/api/generate', { userKey: 'x', templateId: 'travel_swiss', image: IMG })).status, 400);
  });
});
