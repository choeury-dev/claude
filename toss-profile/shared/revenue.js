// 수익성 모델. 값은 모두 "가정"이며 README 의 출처·검증 상태를 같이 볼 것.
// 단위: 원(KRW). 1 DAU(하루 이용자 1명) 기준으로 계산한다.

export const BASE = {
  usdKrw: 1360,              // 2026-11-06 종가 1,363.80원 근처 (검색 확인)
  genCostUsd: 0.039,         // gemini-2.5-flash-image 1장 (제3자 집계, 공식 페이지 미확인)
  freeGenCostUsd: null,      // 무료 이미지만 다른 방식으로 만들 때 (null 이면 genCostUsd)
  faceCheckKrw: 1,           // 얼굴 확인용 텍스트 모델 호출 (가정)
  gensPerDelivered: 1.3,     // 다시 만들기 포함, 사용자가 받는 1장당 생성 횟수 (가정)
  freeImagesPerDau: 1.6,     // 하루 무료 이미지 평균(최대 2) (가정)
  unlockRate: 0.6,           // 무료 이미지 중 광고/쿠팡으로 저장까지 가는 비율 (가정)
  adShareOfUnlock: 0.8,      // 저장 해제 중 광고 시청 비율, 나머지는 쿠팡 (가정)
  ecpmKrw: 20000,            // 보상형 광고 1,000회당 매출. 한국 보상형 약 $21 (게임 앱 벤치마크)
  devAdShare: 0.7,           // 광고 매출 중 개발자 몫. 미확인 (블로그: 약 30% 공제)
  coupangConv: 0.02,         // 쿠팡 클릭 → 24시간 내 구매 비율 (가정)
  coupangAov: 30000,         // 평균 구매액 (가정)
  coupangRate: 0.03,         // 쿠팡 파트너스 기본 수수료 3% (비공식 자료)
  payerRate: 0.03,           // DAU 중 500원 결제자 비율 (가정)
  paidImagesPerPayer: 1.5,   // 결제자 1명당 유료 장수 (가정)
  priceKrw: 500,
  vatIncluded: true,         // 500원에 부가세 포함
  iapFeeRate: 0.3,           // 앱인토스 인앱결제 수수료. 미확인, 보수적으로 30%
};

export function model(input = {}) {
  const a = { ...BASE, ...input };
  const genKrw = a.genCostUsd * a.usdKrw;
  const costPerImage = genKrw * a.gensPerDelivered + a.faceCheckKrw;
  const freeGenKrw = (a.freeGenCostUsd ?? a.genCostUsd) * a.usdKrw;
  const costPerFreeImage = freeGenKrw * a.gensPerDelivered + a.faceCheckKrw;

  const adPerView = (a.ecpmKrw / 1000) * a.devAdShare;
  const coupangPerClick = a.coupangConv * a.coupangAov * a.coupangRate;
  const revPerFreeImage = a.unlockRate * (a.adShareOfUnlock * adPerView + (1 - a.adShareOfUnlock) * coupangPerClick);

  const netPerPaid = (a.vatIncluded ? a.priceKrw / 1.1 : a.priceKrw) * (1 - a.iapFeeRate);
  const paidImagesPerDau = a.payerRate * a.paidImagesPerPayer;

  const free = a.freeImagesPerDau * (revPerFreeImage - costPerFreeImage);
  const paid = paidImagesPerDau * (netPerPaid - costPerImage);

  // 무료 이미지 1장이 본전이 되는 eCPM (쿠팡 수익 제외, 전원 광고 시청 가정 아님: unlockRate 반영)
  const breakEvenEcpm = (costPerFreeImage / (a.unlockRate * a.devAdShare)) * 1000;
  // 무료 손실을 유료로 메우려면 필요한 결제자 비율
  const breakEvenPayerRate = free < 0
    ? -free / (a.paidImagesPerPayer * (netPerPaid - costPerImage))
    : 0;

  return {
    genKrw: round(genKrw),
    costPerImage: round(costPerImage),
    costPerFreeImage: round(costPerFreeImage),
    adPerView: round(adPerView),
    coupangPerClick: round(coupangPerClick),
    revPerFreeImage: round(revPerFreeImage),
    netPerPaid: round(netPerPaid),
    freeProfitPerDau: round(free),
    paidProfitPerDau: round(paid),
    profitPerDau: round(free + paid),
    breakEvenEcpm: Math.round(breakEvenEcpm),
    breakEvenPayerRate: round(breakEvenPayerRate, 4),
  };
}

function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export const SCENARIOS = {
  '기본(Flash, eCPM 2만)': {},
  '낙관(eCPM 3만, 개발자몫 100%, 결제 5%)': { ecpmKrw: 30000, devAdShare: 1, payerRate: 0.05, iapFeeRate: 0.15 },
  '비관(eCPM 1만, 다시만들기 많음)': { ecpmKrw: 10000, gensPerDelivered: 1.8, payerRate: 0.01 },
  '고화질(Pro 모델 $0.134)': { genCostUsd: 0.134 },
  '개선안(무료=템플릿 합성 원가≈0, AI는 유료만)': { freeGenCostUsd: 0 },
};
