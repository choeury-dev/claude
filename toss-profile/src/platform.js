// 토스 앱 안(앱인토스 WebView)과 일반 브라우저(개발용)를 같은 함수로 다룬다.
// SDK 함수 이름은 @apps-in-toss/web-framework 3.10.0 타입 정의 기준.
import {
  Device, File as TossFile, IAP, User, openURL,
  loadFullScreenAd, showFullScreenAd, PermissionError,
} from '@apps-in-toss/web-framework';

const env = import.meta.env;
export const inToss = typeof window !== 'undefined' && Boolean(window.ReactNativeWebView) && !new URLSearchParams(location.search).has('mock');

export const CONFIG = {
  apiBase: env.VITE_API_BASE || '',
  rewardedAdGroupId: env.VITE_AD_GROUP_ID_REWARDED || '',
  iapSku: env.VITE_IAP_SKU || '',
  coupangUrl: env.VITE_COUPANG_URL || 'https://www.coupang.com/',
};

function toDataUrl(dataUri) {
  if (!dataUri) return null;
  return dataUri.startsWith('data:') ? dataUri : `data:image/jpeg;base64,${dataUri}`;
}

// ── 사용자 키 ───────────────────────────────────────
export async function getUserKey() {
  if (inToss) {
    try {
      const r = await User.getAnonymousKey();
      if (r && r.hash) return r.hash;
    } catch { /* 아래로 */ }
  }
  try {
    let k = localStorage.getItem('hyodo:userKey');
    if (!k) { k = 'dev-' + crypto.randomUUID(); localStorage.setItem('hyodo:userKey', k); }
    return k;
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2, 12);
  }
}

// ── 사진 고르기 / 찍기 ──────────────────────────────
function pickFileInBrowser({ capture }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = 'user';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    };
    input.click();
  });
}

/** @returns data URL | null(취소) ; 권한 거부는 { denied: true } */
export async function pickPhoto(source) {
  if (!inToss) return pickFileInBrowser({ capture: source === 'camera' });
  try {
    if (source === 'camera') {
      const r = await Device.openCamera({ base64: true, maxWidth: 1280 });
      return toDataUrl(r && r.dataUri);
    }
    const list = await Device.getPhotos({ base64: true, maxCount: 1, maxWidth: 1280 });
    return toDataUrl(list && list[0] && list[0].dataUri);
  } catch (e) {
    if (e instanceof PermissionError) {
      try {
        const fn = source === 'camera' ? Device.openCamera : Device.getPhotos;
        const r = await fn.openPermissionDialog();
        if (r === 'allowed') return pickPhoto(source);
      } catch { /* ignore */ }
      return { denied: true };
    }
    throw e;
  }
}

// ── 보상형 광고 ────────────────────────────────────
/** 광고를 끝까지 보면 true */
export function showRewardedAd() {
  if (!inToss || !CONFIG.rewardedAdGroupId || !loadFullScreenAd.isSupported()) {
    // 개발용: 2초짜리 가짜 광고
    return new Promise((resolve) => setTimeout(() => resolve(true), 2000));
  }
  const adGroupId = CONFIG.rewardedAdGroupId;
  return new Promise((resolve) => {
    let rewarded = false;
    let cleanupShow = () => {};
    const cleanupLoad = loadFullScreenAd({
      options: { adGroupId },
      onEvent: (ev) => {
        if (ev.type !== 'loaded') return;
        cleanupShow = showFullScreenAd({
          options: { adGroupId },
          onEvent: (e) => {
            if (e.type === 'userEarnedReward') rewarded = true;
            if (e.type === 'dismissed' || e.type === 'failedToShow') {
              cleanupShow(); cleanupLoad();
              resolve(rewarded);
            }
          },
          onError: () => { cleanupShow(); cleanupLoad(); resolve(false); },
        });
      },
      onError: () => { cleanupLoad(); resolve(false); },
    });
  });
}

// ── 쿠팡 파트너스 ──────────────────────────────────
export async function openCoupang() {
  if (inToss) { await openURL(CONFIG.coupangUrl); return true; }
  window.open(CONFIG.coupangUrl, '_blank', 'noopener');
  return true;
}

// ── 500원 결제 ────────────────────────────────────
/**
 * @param grant (orderId) => Promise<boolean>  서버에 지급 요청
 * @returns true(지급 완료) | false(취소/실패)
 */
export function purchaseOne(grant) {
  if (!inToss || !CONFIG.iapSku || !IAP.createOneTimePurchaseOrder.isSupported()) {
    // 개발용: 결제 없이 가짜 주문번호로 지급 (서버 ALLOW_UNVERIFIED_ORDERS=1 필요)
    const ok = window.confirm('[개발용] 500원 결제를 진행할까요?');
    return ok ? grant('dev-' + crypto.randomUUID()) : Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let done = false;
    const cleanup = IAP.createOneTimePurchaseOrder({
      options: {
        sku: CONFIG.iapSku,
        processProductGrant: async ({ orderId }) => {
          done = await grant(orderId);
          return done;
        },
      },
      onEvent: () => { cleanup(); resolve(done); },
      onError: () => { cleanup(); resolve(false); },
    });
  });
}

// ── 저장 ──────────────────────────────────────────
export async function saveImage(dataUrl, fileName) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (inToss && m && TossFile.saveBase64.isSupported()) {
    await TossFile.saveBase64({ data: m[2], fileName, mimeType: m[1] });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
