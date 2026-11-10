// 사용자별 사용량 저장. 시제품이라 JSON 파일 하나에 쓴다.
// 실제 운영에서는 Redis/DB 로 바꾸고, 같은 사용자의 동시 요청을 원자적으로 처리해야 한다.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyRecord } from '../shared/quota.js';

export function createStore(path) {
  let db = { users: {}, orders: {} };
  if (path) {
    try { db = JSON.parse(readFileSync(path, 'utf8')); } catch { /* 첫 실행 */ }
  }
  const save = () => {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + '.tmp', JSON.stringify(db));
    renameSync(path + '.tmp', path);
  };
  return {
    get(userKey) { return db.users[userKey] || emptyRecord(); },
    set(userKey, record) { db.users[userKey] = record; save(); },
    hasOrder(orderId) { return Boolean(db.orders[orderId]); },
    addOrder(orderId, info) { db.orders[orderId] = info; save(); },
  };
}
