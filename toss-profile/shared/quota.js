// 하루 무료 2장 + 유료 크레딧(장당 500원). 날짜는 한국 시간 기준으로 바뀐다.

export const FREE_PER_DAY = 2;
export const PRICE_KRW = 500;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDate(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function emptyRecord() {
  return { date: null, freeUsed: 0, paidCredits: 0 };
}

/** 날짜가 바뀌었으면 무료 사용량을 0으로 */
export function rollover(record, now = new Date()) {
  const r = { ...emptyRecord(), ...record };
  const today = kstDate(now);
  if (r.date !== today) return { ...r, date: today, freeUsed: 0 };
  return r;
}

export function status(record, now = new Date()) {
  const r = rollover(record, now);
  return {
    freeLeft: Math.max(0, FREE_PER_DAY - r.freeUsed),
    paidCredits: r.paidCredits,
    needPayment: r.freeUsed >= FREE_PER_DAY && r.paidCredits <= 0,
  };
}

export class NeedPaymentError extends Error {
  constructor() {
    super('NEED_PAYMENT');
    this.code = 'NEED_PAYMENT';
  }
}

/** 생성 1회 차감. 무료를 먼저 쓰고, 없으면 유료 크레딧. */
export function consume(record, now = new Date()) {
  const r = rollover(record, now);
  if (r.freeUsed < FREE_PER_DAY) return { record: { ...r, freeUsed: r.freeUsed + 1 }, kind: 'free' };
  if (r.paidCredits > 0) return { record: { ...r, paidCredits: r.paidCredits - 1 }, kind: 'paid' };
  throw new NeedPaymentError();
}

/** 생성 실패 시 되돌리기 */
export function refund(record, kind, now = new Date()) {
  const r = rollover(record, now);
  if (kind === 'free') return { ...r, freeUsed: Math.max(0, r.freeUsed - 1) };
  if (kind === 'paid') return { ...r, paidCredits: r.paidCredits + 1 };
  return r;
}

export function addCredits(record, n, now = new Date()) {
  const r = rollover(record, now);
  return { ...r, paidCredits: r.paidCredits + n };
}
