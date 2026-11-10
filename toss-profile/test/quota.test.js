import test from 'node:test';
import assert from 'node:assert/strict';
import { consume, refund, addCredits, status, emptyRecord, kstDate, NeedPaymentError } from '../shared/quota.js';

const day1 = new Date('2026-11-10T03:00:00Z'); // KST 12:00
const day1Late = new Date('2026-11-10T14:59:00Z'); // KST 23:59
const day2 = new Date('2026-11-10T15:00:00Z'); // KST 다음날 00:00

test('KST 날짜 경계', () => {
  assert.equal(kstDate(day1Late), '2026-11-10');
  assert.equal(kstDate(day2), '2026-11-11');
});

test('하루 2장 무료, 3장째는 결제 필요', () => {
  let r = emptyRecord();
  ({ record: r } = consume(r, day1));
  ({ record: r } = consume(r, day1Late));
  assert.equal(status(r, day1).needPayment, true);
  assert.throws(() => consume(r, day1), NeedPaymentError);
  r = addCredits(r, 1, day1);
  const c = consume(r, day1);
  assert.equal(c.kind, 'paid');
  assert.equal(status(c.record, day1).paidCredits, 0);
});

test('자정이 지나면 무료가 다시 생기고 유료 크레딧은 남는다', () => {
  let r = { date: '2026-11-10', freeUsed: 2, paidCredits: 3 };
  assert.deepEqual(status(r, day2), { freeLeft: 2, paidCredits: 3, needPayment: false });
  const c = consume(r, day2);
  assert.equal(c.kind, 'free');
});

test('실패하면 되돌린다', () => {
  let { record, kind } = consume(emptyRecord(), day1);
  record = refund(record, kind, day1);
  assert.equal(status(record, day1).freeLeft, 2);
  record = refund(addCredits(record, 0, day1), 'paid', day1);
  assert.equal(record.paidCredits, 1);
});
