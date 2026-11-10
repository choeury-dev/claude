import { useEffect, useState } from 'react';
import { CATEGORIES, templatesOf } from '../shared/templates.js';
import { judgeQuality, messageOf } from '../shared/quality.js';
import { FREE_PER_DAY, PRICE_KRW } from '../shared/quota.js';
import { api } from './api.js';
import { getUserKey, pickPhoto, showRewardedAd, openCoupang, purchaseOne, saveImage } from './platform.js';
import { measure, compress, composeQuote, watermark } from './imaging.js';

// 화면 흐름: home → templates → photo → checking → (bad) → generating → result
export default function App() {
  const [userKey, setUserKey] = useState(null);
  const [quota, setQuota] = useState(null);
  const [screen, setScreen] = useState('home');
  const [category, setCategory] = useState(null);
  const [template, setTemplate] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [problems, setProblems] = useState([]);
  const [result, setResult] = useState(null); // { image, preview, kind, unlocked }
  const [paywall, setPaywall] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUserKey().then(async (k) => {
      setUserKey(k);
      try { setQuota(await api.quota(k)); } catch { /* 오프라인 */ }
    });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const goHome = () => { setScreen('home'); setPhoto(null); setResult(null); setProblems([]); };

  async function choosePhoto(source) {
    const picked = await pickPhoto(source).catch(() => null);
    if (!picked) return;
    if (picked.denied) { setToast(source === 'camera' ? '카메라 권한을 허용해 주세요' : '사진 권한을 허용해 주세요'); return; }
    setScreen('checking');
    try {
      const small = await compress(picked);
      const [metrics, check] = await Promise.all([measure(picked), api.check(small).catch(() => ({ face: null }))]);
      const verdict = judgeQuality(metrics, check.face);
      setPhoto(small);
      if (!verdict.ok) { setProblems(verdict.problems); setScreen('bad'); return; }
      await generate(small);
    } catch (e) {
      setProblems([{ code: 'ERR', message: e.message || messageOf('') }]);
      setScreen('bad');
    }
  }

  async function generate(image = photo) {
    setScreen('generating');
    try {
      const r = await api.generate(userKey, template.id, image);
      setQuota(r.quota);
      const final = template.overlay ? await composeQuote(r.image, template.overlay) : r.image;
      setResult({ image: final, preview: await watermark(final), kind: r.kind, unlocked: r.kind === 'paid', mock: r.mock });
      setScreen('result');
    } catch (e) {
      if (e.status === 402) { setQuota(e.body.quota); setPaywall(true); setScreen(result ? 'result' : 'photo'); return; }
      setToast(e.message);
      setScreen(result ? 'result' : 'photo');
    }
  }

  async function pay() {
    setBusy(true);
    try {
      const ok = await purchaseOne(async (orderId) => {
        const r = await api.grant(userKey, orderId).catch(() => null);
        if (r && r.granted) setQuota(r.quota);
        return Boolean(r && r.granted);
      });
      setPaywall(false);
      if (ok) { setToast('결제가 완료됐어요. 사진을 만들게요.'); await generate(); }
      else setToast('결제가 취소됐어요');
    } finally {
      setBusy(false);
    }
  }

  async function unlock(how) {
    setBusy(true);
    try {
      const ok = how === 'ad' ? await showRewardedAd() : await openCoupang();
      if (ok) setResult((r) => ({ ...r, unlocked: true }));
      else setToast('광고를 끝까지 보시면 저장할 수 있어요');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await saveImage(result.image, `hyodo-${Date.now()}.jpg`);
    setToast('사진첩에 저장했어요. 카카오톡 프로필로 바꿔 보세요!');
  }

  const needPay = quota && quota.needPayment;
  function startTemplate(t) {
    setTemplate(t);
    setScreen('photo');
  }

  return (
    <div className="app">
      <header className="top">
        {screen !== 'home' && <button className="back" onClick={goHome} aria-label="처음으로">←</button>}
        <h1>효도 프사</h1>
        {quota && (
          <span className="badge">
            {quota.freeLeft > 0 ? `오늘 무료 ${quota.freeLeft}장` : quota.paidCredits > 0 ? `남은 ${quota.paidCredits}장` : `한 장 ${PRICE_KRW}원`}
          </span>
        )}
      </header>

      {screen === 'home' && (
        <main>
          <p className="lead">어떤 프로필 사진을<br />만들어 드릴까요?</p>
          <div className="grid">
            {CATEGORIES.map((c) => (
              <button key={c.id} className="card" onClick={() => { setCategory(c); setScreen('templates'); }}>
                <span className="icon">{c.icon}</span>
                <strong>{c.title}</strong>
                <small>{c.desc}</small>
              </button>
            ))}
          </div>
          <p className="note">하루 {FREE_PER_DAY}장까지 무료, 그다음부터는 한 장에 {PRICE_KRW}원이에요.</p>
        </main>
      )}

      {screen === 'templates' && category && (
        <main>
          <p className="lead">{category.icon} {category.title}<br /><small>마음에 드는 배경을 골라 주세요</small></p>
          <div className="list">
            {templatesOf(category.id).map((t) => (
              <button key={t.id} className="row" onClick={() => startTemplate(t)}>{t.title}<span>›</span></button>
            ))}
          </div>
        </main>
      )}

      {screen === 'photo' && template && (
        <main>
          <p className="lead">{template.title}<br /><small>얼굴이 잘 나온 사진이 필요해요</small></p>
          <ul className="guide">
            <li>✅ 얼굴이 <b>정면</b>으로 크게 나온 사진</li>
            <li>✅ <b>밝은 곳</b>에서 찍은 선명한 사진</li>
            <li>✅ <b>혼자</b> 나온 사진</li>
            <li>❌ 선글라스·마스크·모자로 가린 사진</li>
            <li>❌ 흔들리거나 어두운 사진</li>
          </ul>
          {needPay && <p className="warn">오늘 무료 {FREE_PER_DAY}장을 다 쓰셨어요. 이번 사진은 {PRICE_KRW}원이에요.</p>}
          <div className="actions">
            <button className="primary" onClick={() => choosePhoto('album')}>🖼️ 사진 고르기</button>
            <button className="secondary" onClick={() => choosePhoto('camera')}>📷 사진 찍기</button>
          </div>
        </main>
      )}

      {screen === 'checking' && <Waiting text="사진을 살펴보고 있어요" />}
      {screen === 'generating' && <Waiting text="멋진 사진을 만들고 있어요" sub="20초쯤 걸려요. 화면을 끄지 말아 주세요." />}

      {screen === 'bad' && (
        <main>
          {photo && <img className="thumb" src={photo} alt="고른 사진" />}
          <p className="lead">이 사진으로는<br />예쁘게 만들기 어려워요</p>
          <ul className="problems">{problems.map((p) => <li key={p.code}>{p.message}</li>)}</ul>
          <div className="actions">
            <button className="primary" onClick={() => choosePhoto('album')}>🖼️ 다른 사진 고르기</button>
            <button className="secondary" onClick={() => choosePhoto('camera')}>📷 새로 찍기</button>
          </div>
        </main>
      )}

      {screen === 'result' && result && (
        <main>
          <img className="result" src={result.unlocked ? result.image : result.preview} alt="만든 프로필 사진" />
          {result.mock && <p className="note">[개발 모드] AI 키가 없어 원본을 그대로 보여 드려요.</p>}
          {result.unlocked ? (
            <div className="actions">
              <button className="primary" onClick={save}>💾 사진 저장하기</button>
            </div>
          ) : (
            <>
              <p className="lead small">사진을 저장하려면 하나를 골라 주세요</p>
              <div className="actions">
                <button className="primary" disabled={busy} onClick={() => unlock('ad')}>▶ 광고 보고 저장하기</button>
                <button className="secondary" disabled={busy} onClick={() => unlock('coupang')}>🛒 쿠팡 둘러보고 저장하기</button>
              </div>
              <p className="disclosure">쿠팡 버튼은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
            </>
          )}
          <div className="actions">
            <button className="ghost" onClick={() => (needPay ? setPaywall(true) : generate())}>🔄 다시 만들기 {needPay ? `(${PRICE_KRW}원)` : ''}</button>
            <button className="ghost" onClick={goHome}>처음으로</button>
          </div>
        </main>
      )}

      {paywall && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet-body">
            <p className="lead">오늘 무료 {FREE_PER_DAY}장을<br />모두 만드셨어요</p>
            <p>한 장 더 만들려면 <b>{PRICE_KRW}원</b>이에요.<br />결제한 사진은 광고 없이 바로 저장돼요.</p>
            <div className="actions">
              <button className="primary" disabled={busy || !photo} onClick={pay}>{PRICE_KRW}원 결제하고 만들기</button>
              <button className="ghost" onClick={() => setPaywall(false)}>내일 다시 할게요</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Waiting({ text, sub }) {
  return (
    <main className="waiting">
      <div className="spinner" aria-hidden="true" />
      <p className="lead">{text}</p>
      {sub && <p className="note">{sub}</p>}
    </main>
  );
}
