#!/usr/bin/env node
// 실행: GEMINI_API_KEY=... node server/index.js   (키가 없으면 MOCK 모드)
import { createServer } from 'node:http';
import { createStore } from './store.js';
import { createHandler } from './app.js';
import { config } from './gemini.js';

const port = Number(process.env.PORT || 8787);
const store = createStore(process.env.STORE_PATH || 'data/store.json');

// TODO(출시 전 필수): 토스 서버 API 로 orderId 가 실제 결제 완료 주문인지 확인.
// 지금은 개발 편의를 위해 ALLOW_UNVERIFIED_ORDERS=1 일 때만 무조건 통과시킨다.
async function verifyOrder(orderId) {
  if (process.env.ALLOW_UNVERIFIED_ORDERS === '1') return true;
  console.warn('주문 확인 로직이 아직 없어요. orderId=%s 거절', orderId);
  return false;
}

const allowOrigins = (process.env.ALLOW_ORIGINS || '*').split(',').map((s) => s.trim());
createServer(createHandler({ store, verifyOrder, allowOrigins })).listen(port, () => {
  const cfg = config();
  console.log(`API http://localhost:${port}  model=${cfg.imageModel}${cfg.apiKey ? '' : '  (MOCK: GEMINI_API_KEY 없음)'}`);
});
