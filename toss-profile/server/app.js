// HTTP API (의존성 없이 node:http 만 사용)
//   GET  /api/quota?userKey=…          남은 무료/유료 장수
//   POST /api/check     {image}        얼굴 판정
//   POST /api/generate  {userKey, templateId, image}
//   POST /api/purchase/grant {userKey, orderId}   500원 결제 후 1장 지급
import { findTemplate, buildPrompt } from '../shared/templates.js';
import { status, consume, refund, addCredits, NeedPaymentError } from '../shared/quota.js';
import { checkFace, generateImage } from './gemini.js';

const MAX_BODY = 8 * 1024 * 1024;

function send(res, code, body, cors) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('사진 용량이 너무 커요'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('잘못된 요청이에요'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function validUserKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9_\-=+/.:]{6,200}$/.test(k);
}

/**
 * @param deps.store createStore() 결과
 * @param deps.gemini { checkFace, generateImage } (테스트에서 바꿔 끼움)
 * @param deps.verifyOrder (orderId, userKey) => Promise<boolean>  토스 서버로 주문 확인
 */
export function createHandler({ store, gemini = { checkFace, generateImage }, verifyOrder, allowOrigins = ['*'], now = () => new Date() }) {
  const locks = new Map(); // 같은 사용자의 동시 생성 막기 (단일 프로세스 한정)

  return async function handler(req, res) {
    const origin = req.headers.origin || '';
    const cors = {
      'access-control-allow-origin': allowOrigins.includes('*') ? '*' : (allowOrigins.includes(origin) ? origin : 'null'),
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/api/quota') {
        const userKey = url.searchParams.get('userKey');
        if (!validUserKey(userKey)) return send(res, 400, { error: 'userKey' }, cors);
        return send(res, 200, status(store.get(userKey), now()), cors);
      }

      if (req.method === 'POST' && url.pathname === '/api/check') {
        const { image } = await readJson(req);
        const face = await gemini.checkFace(image);
        return send(res, 200, { face }, cors);
      }

      if (req.method === 'POST' && url.pathname === '/api/generate') {
        const { userKey, templateId, image } = await readJson(req);
        if (!validUserKey(userKey)) return send(res, 400, { error: 'userKey' }, cors);
        const template = findTemplate(templateId);
        if (!template) return send(res, 400, { error: 'templateId' }, cors);
        if (locks.get(userKey)) return send(res, 429, { error: 'BUSY', message: '사진을 만드는 중이에요. 잠시만 기다려 주세요.' }, cors);

        let used;
        try {
          used = consume(store.get(userKey), now());
        } catch (e) {
          if (e instanceof NeedPaymentError) return send(res, 402, { error: 'NEED_PAYMENT', quota: status(store.get(userKey), now()) }, cors);
          throw e;
        }
        store.set(userKey, used.record);
        locks.set(userKey, true);
        try {
          const out = await gemini.generateImage(image, buildPrompt(template));
          return send(res, 200, { image: out.image, kind: used.kind, mock: Boolean(out.mock), quota: status(store.get(userKey), now()) }, cors);
        } catch (e) {
          store.set(userKey, refund(store.get(userKey), used.kind, now())); // 실패하면 돌려준다
          throw e;
        } finally {
          locks.delete(userKey);
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/purchase/grant') {
        const { userKey, orderId } = await readJson(req);
        if (!validUserKey(userKey) || typeof orderId !== 'string' || !orderId) return send(res, 400, { error: 'bad request' }, cors);
        if (store.hasOrder(orderId)) return send(res, 200, { granted: true, duplicate: true, quota: status(store.get(userKey), now()) }, cors);
        const ok = await verifyOrder(orderId, userKey);
        if (!ok) return send(res, 403, { granted: false }, cors);
        store.addOrder(orderId, { userKey, at: now().toISOString() });
        store.set(userKey, addCredits(store.get(userKey), 1, now()));
        return send(res, 200, { granted: true, quota: status(store.get(userKey), now()) }, cors);
      }

      send(res, 404, { error: 'not found' }, cors);
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error(e);
      send(res, code, { error: e.reason || 'ERROR', message: e.message }, cors);
    }
  };
}
