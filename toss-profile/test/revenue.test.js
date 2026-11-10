import test from 'node:test';
import assert from 'node:assert/strict';
import { model } from '../shared/revenue.js';

test('기본 가정에서 원가·순수입 계산', () => {
  const r = model();
  assert.equal(r.genKrw, 53);                // 0.039 × 1360 = 53.04
  assert.equal(r.netPerPaid, 318.2);         // 500 / 1.1 × 0.7
  assert.ok(r.freeProfitPerDau < 0);         // 무료 AI 이미지는 적자
});

test('무료 이미지 원가가 0이면 흑자', () => {
  assert.ok(model({ freeGenCostUsd: 0 }).profitPerDau > 0);
});
