#!/usr/bin/env node
// 사용법: node scripts/revenue.js            (시나리오 표)
//        node scripts/revenue.js ecpmKrw=25000 payerRate=0.05   (값 바꿔 보기)
import { model, SCENARIOS, BASE } from '../shared/revenue.js';

const overrides = Object.fromEntries(
  process.argv.slice(2).map((kv) => {
    const [k, v] = kv.split('=');
    if (!(k in BASE)) throw new Error(`unknown key ${k}. keys: ${Object.keys(BASE).join(', ')}`);
    return [k, typeof BASE[k] === 'boolean' ? v === 'true' : v === 'null' ? null : Number(v)];
  }),
);

const rows = Object.keys(overrides).length
  ? { '사용자 입력': overrides }
  : SCENARIOS;

for (const [name, input] of Object.entries(rows)) {
  const r = model(input);
  console.log(`\n■ ${name}`);
  console.log(`  생성 1회 원가 ${r.genKrw}원 → 받는 1장당 원가 유료 ${r.costPerImage}원 / 무료 ${r.costPerFreeImage}원`);
  console.log(`  무료 1장 수익 ${r.revPerFreeImage}원 (광고 1회 ${r.adPerView}원, 쿠팡 클릭 1회 ${r.coupangPerClick}원)`);
  console.log(`  유료 1장 순수입 ${r.netPerPaid}원`);
  console.log(`  DAU 1명/일: 무료 ${r.freeProfitPerDau}원 + 유료 ${r.paidProfitPerDau}원 = ${r.profitPerDau}원`);
  console.log(`  DAU 1,000명 × 30일: ${Math.round(r.profitPerDau * 1000 * 30).toLocaleString('ko-KR')}원`);
  console.log(`  무료 1장 본전 eCPM: ${r.breakEvenEcpm.toLocaleString('ko-KR')}원 / 무료 손실을 메울 결제자 비율: ${(r.breakEvenPayerRate * 100).toFixed(1)}%`);
}
