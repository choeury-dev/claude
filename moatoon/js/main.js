import {
  EMOTIONS, ACTIONS, BUBBLES, FONT_ROLES, FONTS, BACKGROUNDS, LAYOUTS, SIZES, STYLES, TEXTURES, PAGE_KINDS,
  ANCHORS, ANCHOR_LABEL, PAGE_NUMBER_FORMATS, CHARACTER_COLORS, withDefaults,
} from './catalog.js';
import { parseScript } from './script.js';
import {
  uid, sizeBubble, placeBubble, refineCharacter, reflowBubbles, nearestCharacter, characterBox,
  defaultCharSize, groundY, layoutRows, bubbleRole, layoutText, MIN_BUBBLE, computePanels, headBox, rectsInArea,
} from './layout.js';
import { renderPage, face, figure, drawImageFigure, entryCrop, entryHead, pickEntry, drawMarks } from './render.js';
import { textureDefs, textureFilterAttr, filterDef } from './texture.js';
import { checkLine } from './spell.js';
import { aiCheck, aiCharacterGuide, basicGuide, describeError, aiFindRegions, testAnthropicKey } from './ai.js';
import { IMAGE_MODELS, testOpenAIKey } from './openai-image.js';
import { fillBackground, cutOutCharacter, changeExpression, expandRect } from './image-edit.js';
import * as store from './store.js';
import { sanitizeEpisode, sanitizeAsset, safeImageUrl, sanitizeTemplate } from './sanitize.js';

// GitHub Pages 배포 주소 (미리보기 화면에서 Google 연결이 막힐 때 안내용)
const DEPLOY_URL = 'https://choeury-dev.github.io/claude/moatoon/';
import * as drive from './drive.js';
import { BUILTIN_TEMPLATES } from './catalog.js';
import {
  buildPages, templateFromPage, applyTemplate, applyRects, blankPage, migrateProject, allTemplates, findTemplate, makeText, perPage,
} from './pages.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LS = { defaults: 'moatoon.defaults', templates: 'moatoon.templates', key: 'moatoon.v1.key', google: 'moatoon.google', ui: 'moatoon.ui', old: 'moatoon.v1', migrated: 'moatoon.migrated' };

const SAMPLE = `제목: 커피 한 잔의 비밀
회차: 3화
부제: 민지의 수상한 친절

#1 카페, 아침
민지(기쁨): 오늘 커피는 내가 살께!
준호(놀람): 웬일이야? 몇일 만에 일찍 왔네
(민지가 손을 흔든다)

#2 카페
민지(설렘): 아메리카노는 1900년에 이탈리아에서 처음 만들어졌대
준호(속마음): 갑자기 커피 상식이라니… 뭔가 수상한데

#3 사무실
내레이션: 그날 오후
팀장(화남): 보고서 아직이야?!
준호(당황): 지금 할려고 했어요!!

#4 사무실, 밤
(준호가 머리를 긁적인다)
민지(기쁨): 그래서 커피 산 거야. 야근 화이팅!
준호(피곤): 어떻해… 안되…

[마지막]
- 커피를 사 주는 친구는 야근을 미리 알고 있다
- 보고서는 미리미리
마무리: 다음 화에서 만나요!`;

// ── 상태 ─────────────────────────────────────────────────────────────
const app = {
  view: 'home', homeSrc: 'local', homeQuery: '',
  defaults: withDefaults(store.lsGet(LS.defaults, null)),
  templates: store.lsGet(LS.templates, []),
  apiKey: store.lsGet(LS.key, ''),
  google: { clientId: '', folder: '', ...store.lsGet(LS.google, {}) },
  ui: { tab: 'elements', guides: true, sideClosed: false, layersClosed: false, ...store.lsGet(LS.ui, {}) },
  openai: { model: 'gpt-image-2.5-sunburst', quality: 'high', keepPixels: true, faceOnly: true, ...store.lsGet('moatoon.openai', {}) },
  openaiKey: '', editBusy: '',
  assets: {}, episodes: [],
  ep: null, page: 0, selected: null, zoom: 1, zoomFit: true,
  ai: {}, aiPick: null, undo: [], redo: [],
  drivePath: [], driveFiles: null, driveBusy: false,
};
const S = () => app.ep.settings;
const P = () => app.ep.project;
const PG = () => P().pages[app.page];
const saveUi = () => store.lsSet(LS.ui, app.ui);
// 키는 예전 버전과 같은 자리에 문자열로 둔다
const saveKey = () => { try { localStorage.setItem(LS.key, app.apiKey); } catch { /* */ } };
try { app.apiKey = localStorage.getItem(LS.key) || ''; app.openaiKey = localStorage.getItem('moatoon.openai.key') || ''; } catch { /* */ }
const saveOpenai = () => { store.lsSet('moatoon.openai', app.openai); try { localStorage.setItem('moatoon.openai.key', app.openaiKey); } catch { /* */ } };

// ── 공용 UI ──────────────────────────────────────────────────────────
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}
function openModal(title, html, bind) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  if (bind) bind($('#modal-body'));
}
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }

const mctx = document.createElement('canvas').getContext('2d');
function measure(text, family, size) {
  mctx.font = `${size}px "${family}", sans-serif`;
  return mctx.measureText(text).width;
}
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ── 회차 저장 ─────────────────────────────────────────────────────────
let saveTimer = 0;
function save() {
  if (!app.ep) return;
  const st = $('#save-state');
  st.classList.add('busy'); st.querySelector('span').textContent = '저장 중';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    app.ep.updated = Date.now();
    await store.put('episodes', clone(app.ep));
    const i = app.episodes.findIndex((e) => e.id === app.ep.id);
    if (i >= 0) app.episodes[i] = clone(app.ep); else app.episodes.push(clone(app.ep));
    st.classList.remove('busy'); st.querySelector('span').textContent = '저장됨';
  }, 400);
}
function snapshot() {
  app.undo.push(JSON.stringify(P()));
  if (app.undo.length > 80) app.undo.shift();
  app.redo = [];
}
function undo() {
  const prev = app.undo.pop();
  if (!prev) { toast('되돌릴 작업이 없습니다.'); return; }
  app.redo.push(JSON.stringify(P()));
  app.ep.project = JSON.parse(prev);
  app.page = Math.min(app.page, P().pages.length - 1);
  app.selected = null;
  renderEditor(); save();
}
function redo() {
  const next = app.redo.pop();
  if (!next) { toast('다시 실행할 작업이 없습니다.'); return; }
  app.undo.push(JSON.stringify(P()));
  app.ep.project = JSON.parse(next);
  app.page = Math.min(app.page, P().pages.length - 1);
  app.selected = null;
  renderEditor(); save();
}

// ── 이미지 캐릭터 ────────────────────────────────────────────────────
function updateItemImage(item, chars) {
  const ch = (chars || P().characters).find((c) => c.id === item.charId);
  const e = pickEntry(item, ch);
  const a = e && app.assets[e.assetId];
  if (a) {
    const c = entryCrop(e, a);
    item.aspect = c.w / c.h;
    item.head = entryHead(e, a);
  } else { delete item.aspect; delete item.head; }
}
function allPanels() { return P().pages.flatMap((p) => p.panels); }
function refreshCharacterItems(charId) {
  for (const pg of P().pages) for (const pn of pg.panels) {
    let touched = false;
    for (const it of pn.items) if (it.type === 'character' && (!charId || it.charId === charId)) { updateItemImage(it); touched = true; }
    if (touched) reflowBubbles(pn, S().style, S(), measure);
  }
}
function usedAssetIds(ep) {
  const ids = new Set();
  for (const c of ep.project.characters) for (const e of c.images || []) ids.add(e.assetId);
  for (const pg of ep.project.pages) for (const pn of pg.panels) {
    if (pn.bgImage) ids.add(pn.bgImage);
    if (pn.imageEdit) { ids.add(pn.imageEdit.original); if (pn.imageEdit.plate) ids.add(pn.imageEdit.plate); }
    for (const it of pn.items) if (it.type === 'sticker') { ids.add(it.assetId); for (const v of it.versions || []) ids.add(v); }
  }
  if (ep.settings.watermark.assetId) ids.add(ep.settings.watermark.assetId);
  return [...ids];
}

// ── 회차 만들기·열기 ─────────────────────────────────────────────────
function generateEp(ep, keepChars = true) {
  const prevChars = keepChars && ep.project ? ep.project.characters : [];
  const firstPass = parseScript(ep.script, prevChars.map((c) => c.name));
  // 새 대본에 나오거나 이미지를 등록한 인물만 남긴다(예시 대본 인물이 남지 않게)
  const chars = prevChars.filter((c) => firstPass.characters.includes(c.name) || (c.images && c.images.length));
  const parsed = chars.length === prevChars.length ? firstPass : parseScript(ep.script, chars.map((c) => c.name));
  const res = buildPages(parsed, ep.settings, app.templates, chars, measure, (it) => updateItemImage(it, chars));
  ep.project = { title: res.title, episode: res.episode, characters: res.characters, pages: res.pages };
  if (!ep.name || ep.name === '새 회차') ep.name = [res.episode, res.title].filter(Boolean).join(' ') || ep.name || '새 회차';
  return res;
}
function newEpisode(script, name, source) {
  const ep = { id: uid('ep'), name: name || '', script, settings: clone(app.defaults), project: null, source: source || { type: 'local' }, updated: Date.now() };
  generateEp(ep, false);
  if (!ep.name) ep.name = '새 회차';
  return ep;
}
// 저장된 회차든 남이 보낸 회차 파일이든, 열 때 모든 값을 검사한다(sanitize.js)
function normalizeEp(ep) {
  const clean = sanitizeEpisode({ ...ep, project: migrateProject((ep && ep.project) || { panels: [] }) });
  if (!clean.project.pages.length) clean.project.pages = migrateProject({ panels: [] }).pages;
  for (const k of Object.keys(ep)) delete ep[k];
  return Object.assign(ep, clean);
}
function openEpisode(ep) {
  app.ep = normalizeEp(clone(ep));
  app.page = 0; app.selected = null; app.undo = []; app.redo = []; app.ai = {}; app.zoomFit = true;
  app.view = 'editor';
  showView();
  // 저장된 글꼴 폭으로 다시 잰다
  fontsReady().then(() => { if (app.ep) { resizeAllText(); renderEditor(); } });
}
async function openEpisodeJson(json, source) {
  if (!json || json.format !== 'moatoon-episode') throw new Error('모아툰 회차 파일이 아닙니다.');
  let skipped = 0;
  for (const raw of Object.values(json.assets || {})) {
    const a = sanitizeAsset(raw);
    if (!a) { skipped++; continue; }
    delete a.guide;
    if (!app.assets[a.id]) { app.assets[a.id] = a; await store.put('assets', a); }
  }
  if (skipped) toast(`형식이 맞지 않는 이미지 ${skipped}개는 열지 않았습니다.`);
  const ep = { id: json.id || uid('ep'), name: json.name || '회차', script: json.script || '', settings: json.settings, project: json.project, source, updated: Date.now() };
  openEpisode(ep);
  save();
}
function episodeJson(ep) {
  const assets = {};
  for (const id of usedAssetIds(ep)) if (app.assets[id]) { const { guide, ...a } = app.assets[id]; assets[id] = a; }
  return { format: 'moatoon-episode', version: 2, id: ep.id, name: ep.name, script: ep.script, settings: ep.settings, project: ep.project, assets };
}

function fontsReady() {
  return document.fonts.ready.then(() => {
    const s = app.ep ? S() : app.defaults;
    const fams = new Set(FONT_ROLES.map((r) => s.fonts[r.id].family));
    return Promise.all([...fams].map((f) => document.fonts.load(`20px "${f}"`, '가나다')));
  }).catch(() => {});
}
function resizeAllText() {
  for (const pg of P().pages) {
    for (const pn of pg.panels) {
      let prev = null;
      for (const b of pn.items.filter((x) => x.type === 'bubble')) {
        const keep = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        Object.assign(b, sizeBubble(b, pn, S(), measure));
        placeBubble(pn, b, pn.items, style(), { ideal: keep, pull: 1.5, prev });
        prev = b;
      }
    }
    for (const t of pg.texts) Object.assign(t, layoutText(t, S(), measure));
  }
}

// ── 화면 전환 ────────────────────────────────────────────────────────
function showView() {
  $('#home').hidden = app.view !== 'home';
  $('#editor').hidden = app.view !== 'editor';
  if (app.view === 'home') renderHome(); else renderEditor();
}
function goHome() {
  clearTimeout(saveTimer);
  if (app.ep) { app.ep.updated = Date.now(); store.put('episodes', clone(app.ep)); const i = app.episodes.findIndex((e) => e.id === app.ep.id); if (i >= 0) app.episodes[i] = clone(app.ep); else app.episodes.push(clone(app.ep)); }
  app.ep = null; app.view = 'home'; showView();
}

// ══ 첫 화면: 드라이브 ═══════════════════════════════════════════════
const ICON = {
  doc: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
};

function pageSVGString(ep, i, cls = '', opts = { fast: true }) {
  const page = ep.project.pages[i];
  if (!page) return '';
  const { width, height, inner } = renderPage(page, { project: ep.project, settings: ep.settings, assets: app.assets, index: i, total: ep.project.pages.length, opts });
  return `<svg class="${cls}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
}

function renderHome() {
  $$('.side-link').forEach((b) => b.classList.toggle('on', b.dataset.src === app.homeSrc));
  const c = $('#home-content');
  if (app.homeSrc === 'local') c.innerHTML = homeLocal();
  else if (app.homeSrc === 'google') c.innerHTML = homeGoogle();
  else c.innerHTML = homeLayouts();
}

function homeLocal() {
  const q = app.homeQuery.trim();
  const list = app.episodes.filter((e) => !q || e.name.includes(q)).sort((a, b) => b.updated - a.updated);
  const cards = list.map((ep) => {
    let thumb;
    try { thumb = pageSVGString(normalizeEp(clone(ep)), 0); } catch { thumb = ICON.doc; }
    const n = ep.project?.pages?.length || 1;
    return `<div class="card" role="button" tabindex="0" data-open="${ep.id}">
      <div class="thumb">${thumb}</div>
      ${ep.source?.type === 'drive' ? '<span class="badge">Google 드라이브</span>' : ''}
      <div class="meta"><b>${esc(ep.name)}</b><span>${n}페이지 · ${fmtDate(ep.updated)}</span></div>
      <div class="card-menu"><button data-dup="${ep.id}">복제</button><button data-del="${ep.id}">삭제</button></div>
    </div>`;
  }).join('');
  return `<div class="section-head"><h2>내 드라이브</h2><span class="muted">이 브라우저에 저장된 회차 ${app.episodes.length}개</span></div>
    ${list.length ? `<div class="grid-cards">${cards}</div>` : `<div class="empty">${q ? '찾는 회차가 없습니다.' : '아직 회차가 없습니다. "새 회차 만들기"를 누르거나 Google 드라이브에서 회차 파일을 고르세요.'}</div>`}`;
}

function homeGoogle() {
  if (!app.google.clientId) {
    return `<div class="section-head"><h2>Google 드라이브</h2></div>${driveErrorBox()}
      <div class="connect-box">
        <b>Google 드라이브의 회차 파일을 열려면 OAuth 클라이언트 ID가 필요합니다.</b>
        <ol>
          <li>Google Cloud 콘솔에서 프로젝트를 만들고 <b>Google Drive API</b>를 사용 설정합니다.</li>
          <li>사용자 인증 정보 → OAuth 클라이언트 ID → 유형 <b>웹 애플리케이션</b>을 만듭니다.</li>
          <li>승인된 JavaScript 원본에 이 페이지 주소(<code>${esc(location.origin)}</code>)를 넣습니다.</li>
          <li>만든 클라이언트 ID를 아래에 붙여 넣고 연결합니다.</li>
        </ol>
        <label class="field"><span>OAuth 클라이언트 ID</span><input id="g-client" placeholder="1234-abc.apps.googleusercontent.com" value=""></label>
        <label class="field"><span>회차 폴더 주소 (선택: 비우면 내 드라이브 전체)</span><input id="g-folder" placeholder="https://drive.google.com/drive/folders/…" value="${esc(app.google.folder)}"></label>
        <div class="row"><button class="btn accent" data-g="save-connect">저장하고 연결</button></div>
        <p class="hint">회차 파일은 구글 문서, .txt/.md 스크립트, 이 앱이 저장한 .moatoon.json 을 엽니다. 클라이언트 ID는 이 브라우저에만 저장됩니다.</p>
      </div>${OFFLINE_HELP}`;
  }
  if (!drive.isConnected()) {
    return `<div class="section-head"><h2>Google 드라이브</h2></div>${driveErrorBox()}
      <div class="connect-box"><b>Google 계정으로 연결하면 회차 파일 목록을 불러옵니다.</b>
      <div class="row"><button class="btn accent" data-g="connect">Google 드라이브 연결</button><button class="btn line" data-g="forget">클라이언트 ID 지우기</button></div>
      <p class="hint">처음 연결할 때 Google이 드라이브 읽기와 이 앱이 만든 파일 저장 권한을 묻습니다.</p></div>${OFFLINE_HELP}`;
  }
  const crumbs = [{ id: drive.folderIdFrom(app.google.folder) || '', name: app.google.folder ? '회차 폴더' : '내 드라이브' }, ...app.drivePath];
  const files = app.driveFiles || [];
  const folders = files.filter((f) => drive.kindOf(f) === 'folder');
  const docs = files.filter((f) => drive.kindOf(f) !== 'folder');
  const unsupported = docs.filter((f) => drive.kindOf(f) === 'unsupported');
  const q = app.homeQuery.trim();
  const shown = docs.filter((f) => !q || f.name.includes(q));
  const g = drive.grantedScopes();
  return `<div class="section-head"><h2>Google 드라이브</h2><div class="row"><button class="btn line sm" data-g="refresh">새로고침</button><button class="btn line sm" data-g="disconnect">연결 해제</button></div></div>
    ${driveErrorBox()}
    <p class="hint" style="margin-bottom:10px">● 연결됨 · 약 ${drive.minutesLeft()}분 동안 유지(이 탭) · 드라이브 파일 보기 권한 ${g.read ? '✓' : '✕ (목록이 비어 보일 수 있음)'} · ${app.google.folder ? '회차 폴더 안의 모든 파일' : '내 드라이브 전체의 구글 문서·txt·md·회차 파일'}</p>
    <div class="crumbs">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<button data-crumb="${i}">${esc(c.name)}</button> ›` : `<b>${esc(c.name)}</b>`)).join(' ')}</div>
    ${app.driveBusy ? '<div class="empty">불러오는 중…</div>' : ''}
    ${folders.length ? `<h3 class="muted">폴더</h3><div class="folder-row">${folders.map((f) => `<button class="folder" data-folder="${f.id}" data-name="${esc(f.name)}"><span class="fi">${ICON.folder}</span><span><b>${esc(f.name)}</b><span>폴더</span></span></button>`).join('')}</div>` : ''}
    <h3 class="muted">회차 파일</h3>
    ${shown.length ? `<div class="grid-cards">${shown.map((f) => {
      const k = drive.kindOf(f);
      const label = k === 'episode' ? '회차' : k === 'unsupported' ? '열 수 없는 형식' : f.mimeType === drive.MIME.doc ? '구글 문서 스크립트' : '스크립트';
      if (k === 'unsupported') return `<div class="card" style="opacity:.55;cursor:default" title="구글 문서, .txt, .md, .moatoon.json 만 열 수 있습니다"><div class="thumb">${ICON.doc}</div><span class="badge">${label}</span><div class="meta"><b>${esc(f.name)}</b><span>${esc(f.mimeType.split('/').pop().split('.').pop())}</span></div></div>`;
      return `<div class="card" role="button" tabindex="0" data-gfile="${f.id}"><div class="thumb">${ICON.doc}</div><span class="badge">${label}</span><div class="meta"><b>${esc(f.name)}</b><span>${fmtDate(f.modifiedTime)}</span></div></div>`;
    }).join('')}</div>${unsupported.length ? `<p class="hint" style="margin-top:10px">흐리게 보이는 ${unsupported.length}개는 열 수 없는 형식입니다(Word·한글·PDF 등). 구글 문서로 열어 저장하거나 .txt 로 내려받아 주세요.</p>` : ''}` : (app.driveBusy || app.driveError ? '' : `<div class="empty">${app.google.folder ? '이 폴더가 비어 있습니다.' : '내 드라이브에서 구글 문서·txt·md·회차 파일을 찾지 못했습니다.'}<br>${g.read ? '' : '드라이브 파일 보기 권한이 없으면 이렇게 보입니다. 위의 "연결 해제" 후 다시 연결하며 권한을 모두 체크해 주세요.'}</div>`)}`;
}

function tplThumb(tpl, s) {
  const W = s.width, H = s.height;
  let rects = tpl.panels;
  if (!rects) rects = computePanels(s, s.layout === 'auto' ? 'g4' : s.layout, false).map((r) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H }));
  const p = rects.map((r) => `<rect x="${r.x * W}" y="${r.y * H}" width="${r.w * W}" height="${r.h * H}" fill="#eef1f5" stroke="#1b1f2a" stroke-width="${W / 120}"/>`).join('');
  const t = (tpl.texts || []).map((r) => `<rect x="${r.x * W + W * 0.02}" y="${(r.y + r.h * 0.3) * H}" width="${r.w * W * 0.96}" height="${Math.max(H * 0.012, r.h * H * 0.4)}" rx="${W / 80}" fill="${r.box ? '#c5ccd6' : '#8a94a3'}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${p}${t}</svg>`;
}

function homeLayouts() {
  const all = allTemplates(app.templates);
  return `<div class="section-head"><h2>레이아웃 보관함</h2><div class="row"><button class="btn accent" data-tplact="create">＋ 새 레이아웃 만들기</button><button class="btn line" data-tplact="upload">레이아웃 파일 올리기</button></div></div>
    <p class="hint">편집 화면에서 다듬은 페이지는 페이지 위 아이콘의 "레이아웃으로 등록"으로도 추가할 수 있습니다. 내가 만든 레이아웃은 파일로 내보내 다른 컴퓨터에서 올릴 수 있습니다.</p>
    ${PAGE_KINDS.map((k) => `<h3 class="muted" style="margin:18px 0 10px">${k.label}</h3><div class="grid-cards">${all.filter((t) => t.kind === k.id).map((t) => `<div class="card"><div class="thumb" style="aspect-ratio:${app.defaults.width}/${app.defaults.height};background:#fff">${tplThumb(t, app.defaults)}</div><div class="meta"><b>${esc(t.name)}</b><span>${t.builtin ? '기본 레이아웃' : '내가 등록'}${app.defaults.pageTemplates[k.id] === t.id ? ' · 새 회차 기본값' : ''}</span></div>${t.builtin ? '' : `<div class="card-menu"><button data-tpl-default="${t.id}">기본값으로</button><button data-tpl-export="${t.id}">내보내기</button><button data-del-tpl="${t.id}">삭제</button></div>`}</div>`).join('')}</div>`).join('')}
    <input id="file-template" type="file" accept=".json,application/json" hidden>`;
}

async function driveList() {
  app.driveBusy = true; renderHome();
  try {
    const cur = app.drivePath.length ? app.drivePath[app.drivePath.length - 1].id : drive.folderIdFrom(app.google.folder);
    app.driveFiles = await drive.list(cur);
    app.driveError = null;
  } catch (e) { app.driveError = { code: e.code || 'other', message: e.message }; app.driveFiles = []; }
  app.driveBusy = false; renderHome();
}
async function driveConnect(forceConsent = false) {
  app.driveError = null;
  try { await drive.connect(app.google.clientId, { forceConsent }); app.drivePath = []; await driveList(); } catch (e) { app.driveError = { code: e.code || 'other', message: e.message }; renderHome(); }
}
function driveErrorBox() {
  const e = app.driveError;
  if (!e) return '';
  const help = {
    script: `<p>이 화면에서는 Google 로그인 스크립트를 불러올 수 없습니다. <b>claude.ai 미리보기 화면은 보안 정책 때문에 외부 로그인(Google)을 막습니다.</b></p>
      <p>배포한 주소에서 열어 주세요: <a href="${DEPLOY_URL}" target="_blank" rel="noopener">${DEPLOY_URL}</a></p>
      <p class="hint">배포 주소에서도 같은 오류가 나면 광고·추적 차단 확장 프로그램이 Google 스크립트를 막고 있을 수 있습니다.</p>`,
    denied: `<p>Google이 접근을 거부했습니다(access_denied). 앱이 <b>테스트</b> 상태라서 <b>테스트 사용자</b>로 등록한 계정만 로그인할 수 있습니다.</p>
      <p class="hint">Google Cloud 콘솔 → Google 인증 플랫폼 → 대상 → 테스트 사용자에, 로그인 창에서 고른 계정 주소를 myaccount.google.com 에 표시된 그대로 추가하세요.</p>`,
    popup: '<p>로그인 창을 열지 못했습니다. 브라우저 주소창의 팝업 차단 아이콘에서 이 사이트의 팝업을 허용해 주세요.</p>',
    scope: `<p><b>"Google 드라이브 파일 보기" 권한이 빠져 있습니다.</b> Google 동의 화면에서 권한마다 체크 상자가 있는데, 체크하지 않으면 이 앱이 만든 파일 말고는 보이지 않습니다.</p>
      <div class="row"><button class="btn accent sm" data-g="reconsent">권한 다시 받기 (모두 체크)</button></div>`,
    'api-disabled': `<p><b>Google Cloud 프로젝트에서 Google Drive API가 꺼져 있습니다.</b> 클라이언트 ID를 만든 프로젝트에서 켜야 합니다.</p>
      <p><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API 페이지 열기</a> → 위쪽 프로젝트가 맞는지 확인 → <b>사용</b>. 켠 뒤 몇 분 지나 다시 시도하세요.</p>${e.message ? `<p class="hint">${esc(e.message)}</p>` : ''}`,
    notfound: '<p>폴더를 찾지 못했습니다. "연결 설정"의 회차 폴더 주소가 맞는지, 로그인한 계정이 그 폴더를 볼 수 있는지 확인해 주세요.</p>',
    forbidden: `<p>Google이 접근을 막았습니다.</p><p class="hint">${esc(e.message)}</p>`,
    expired: '<p>로그인이 만료되었습니다(약 1시간). 다시 연결을 눌러 주세요.</p>',
    closed: '<p>로그인 창이 닫혔습니다. 다시 연결을 눌러 주세요.</p>',
  }[e.code] || `<p>${esc(e.message)}</p>`;
  return `<div class="connect-box" style="border-color:var(--warn);margin-bottom:14px"><b style="color:var(--warn)">연결하지 못했습니다</b>${help}</div>`;
}
const OFFLINE_HELP = `<div class="connect-box" style="margin-top:14px"><b>연결 없이 드라이브 파일 쓰기</b>
  <p class="hint">Google 드라이브에서 스크립트를 내려받아(구글 문서는 파일 → 다운로드 → 일반 텍스트) 바로 열 수 있습니다.</p>
  <div class="row"><button class="btn line" data-g="local-file">내려받은 파일 열기</button></div></div>`;
async function openDriveFile(id) {
  const f = (app.driveFiles || []).find((x) => x.id === id);
  if (!f) return;
  toast(`${f.name} 여는 중…`);
  try {
    const text = await drive.read(f);
    const folderId = (f.parents && f.parents[0]) || drive.folderIdFrom(app.google.folder);
    if (drive.kindOf(f) === 'episode') {
      await openEpisodeJson(JSON.parse(text), { type: 'drive', fileId: f.id, folderId });
    } else {
      const ep = newEpisode(text, f.name.replace(/\.(txt|md)$/i, ''), { type: 'drive-script', scriptId: f.id, folderId });
      openEpisode(ep); save();
      toast('스크립트로 회차를 만들었습니다. "드라이브에 저장"을 누르면 같은 폴더에 회차 파일로 저장됩니다.');
    }
  } catch (e) { toast(e.message || '파일을 열지 못했습니다.'); }
}

function bindHome() {
  $('#home-search').addEventListener('input', (e) => { app.homeQuery = e.target.value; renderHome(); });
  $('#btn-home-new').addEventListener('click', () => startNew());
  $('#btn-home-import').addEventListener('click', () => $('#file-script').click());
  $$('.side-link').forEach((b) => b.addEventListener('click', () => {
    app.homeSrc = b.dataset.src; renderHome();
    if (app.homeSrc === 'google' && drive.isConnected() && !app.driveFiles) driveList();
  }));
  $$('.home-rail .rail-btn').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.home === 'settings') openConnSettings();
  }));
  $('.banner').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'new') startNew();
    if (a.dataset.act === 'google') {
      app.homeSrc = 'google'; renderHome();
      if (drive.isConnected()) { if (!app.driveFiles) driveList(); }
      else if (app.google.clientId) driveConnect(); // 클릭한 그 순간에 로그인 창을 연다(팝업 차단 피함)
    }
  });
  $('#home-content').addEventListener('click', async (e) => {
    const t = e.target;
    const del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      if (del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = '정말 삭제?'; return; }
      await store.del('episodes', del.dataset.del);
      app.episodes = app.episodes.filter((x) => x.id !== del.dataset.del);
      renderHome(); toast('회차를 삭제했습니다.');
      return;
    }
    const dup = t.closest('[data-dup]');
    if (dup) {
      e.stopPropagation();
      const src = app.episodes.find((x) => x.id === dup.dataset.dup);
      const ep = { ...clone(src), id: uid('ep'), name: `${src.name} 복사본`, source: { type: 'local' }, updated: Date.now() };
      await store.put('episodes', ep); app.episodes.push(ep); renderHome();
      return;
    }
    const ta = t.closest('[data-tplact]');
    if (ta) { if (ta.dataset.tplact === 'create') createLayoutDialog(); else $('#file-template').click(); return; }
    const te = t.closest('[data-tpl-export]');
    if (te) { e.stopPropagation(); exportTemplate(te.dataset.tplExport); return; }
    const td = t.closest('[data-tpl-default]');
    if (td) {
      e.stopPropagation();
      const tpl = app.templates.find((x) => x.id === td.dataset.tplDefault);
      app.defaults.pageTemplates[tpl.kind] = tpl.id; store.lsSet(LS.defaults, app.defaults);
      renderHome(); toast(`새 회차의 ${pageKindLabel(tpl.kind)} 페이지에 '${tpl.name}'을(를) 씁니다.`);
      return;
    }
    const delT = t.closest('[data-del-tpl]');
    if (delT) { app.templates = app.templates.filter((x) => x.id !== delT.dataset.delTpl); store.lsSet(LS.templates, app.templates); renderHome(); return; }
    const open = t.closest('[data-open]');
    if (open) { const ep = app.episodes.find((x) => x.id === open.dataset.open); if (ep) openEpisode(ep); return; }
    const g = t.closest('[data-g]');
    if (g) {
      const act = g.dataset.g;
      if (act === 'save-connect') {
        app.google.clientId = $('#g-client').value.trim();
        app.google.folder = $('#g-folder').value.trim();
        store.lsSet(LS.google, app.google);
        if (!app.google.clientId) { toast('클라이언트 ID를 입력해 주세요.'); return; }
        driveConnect();
      }
      if (act === 'connect') driveConnect();
      if (act === 'reconsent') driveConnect(true);
      if (act === 'refresh') driveList();
      if (act === 'disconnect') { drive.disconnect(); app.driveFiles = null; renderHome(); }
      if (act === 'forget') { app.google.clientId = ''; store.lsSet(LS.google, app.google); renderHome(); }
      if (act === 'local-file') $('#file-script').click();
      return;
    }
    const fo = t.closest('[data-folder]');
    if (fo) { app.drivePath.push({ id: fo.dataset.folder, name: fo.dataset.name }); driveList(); return; }
    const cr = t.closest('[data-crumb]');
    if (cr) { app.drivePath = app.drivePath.slice(0, Number(cr.dataset.crumb)); driveList(); return; }
    const gf = t.closest('[data-gfile]');
    if (gf) openDriveFile(gf.dataset.gfile);
  });
  $('#home-content').addEventListener('change', async (e) => {
    if (e.target.id !== 'file-template') return;
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : Array.isArray(data.templates) ? data.templates : [data];
      const added = list.map((t) => sanitizeTemplate(t, uid('tpl'))).filter(Boolean);
      if (!added.length) { toast('레이아웃 파일이 아닙니다. 이 앱에서 내보낸 .json 파일을 올려 주세요.'); return; }
      app.templates.push(...added); store.lsSet(LS.templates, app.templates);
      renderHome(); toast(`레이아웃 ${added.length}개를 올렸습니다.`);
    } catch { toast('파일을 읽지 못했습니다. 이 앱에서 내보낸 레이아웃 .json 파일인지 확인해 주세요.'); }
  });
  $('#home-content').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const c = e.target.closest('[data-open],[data-gfile]');
    if (c) c.click();
  });
  $('#file-script').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const text = await f.text();
    try {
      if (/\.json$/i.test(f.name)) await openEpisodeJson(JSON.parse(text), { type: 'local' });
      else { const ep = newEpisode(text, f.name.replace(/\.(txt|md)$/i, '')); openEpisode(ep); save(); }
    } catch (err) { toast(err.message); }
  });
}

// ── 레이아웃 만들기·내보내기 ─────────────────────────────────────────
function rowsFromSpec(spec) {
  const nums = String(spec).split(/[^0-9]+/).map(Number).filter((n) => n >= 1 && n <= 6).slice(0, 8);
  return nums.map((n) => Array(n).fill(1));
}
function layoutFromSpec(kind, spec) {
  const d = app.defaults, W = d.width, H = d.height;
  const builtin = BUILTIN_TEMPLATES.find((t) => t.kind === kind && t.panels);
  const area = kind !== 'content' && builtin ? { x: builtin.panels[0].x * W, y: builtin.panels[0].y * H, w: builtin.panels[0].w * W, h: builtin.panels[0].h * H } : { x: d.margin, y: d.margin, w: W - d.margin * 2, h: H - d.margin * 2 };
  const rows = rowsFromSpec(spec);
  const panels = rows.length ? rectsInArea(area, rows, d.gutter).map((r) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H })) : [];
  return { panels, texts: kind !== 'content' && builtin ? clone(builtin.texts) : [] };
}
function createLayoutDialog() {
  openModal('새 레이아웃 만들기', `
    <div class="row" style="align-items:flex-start;gap:18px;flex-wrap:wrap">
      <div id="nl-prev" style="width:180px;background:#fff;border-radius:6px"></div>
      <div style="display:grid;gap:10px;flex:1;min-width:240px">
        <label class="field"><span>이름</span><input id="nl-name" maxlength="30" value="내 레이아웃"></label>
        <label class="field"><span>종류</span><select id="nl-kind">${opt(PAGE_KINDS, 'content')}</select></label>
        <label class="field"><span>줄마다 칸 수 (위에서부터, 쉼표로)</span><input id="nl-rows" value="1,2" placeholder="예: 1,2,2"></label>
        <div class="row">${['1', '2', '1,1', '1,2', '2,2', '1,2,2', '2,2,2', '3,3,3'].map((r) => `<button class="btn line sm" data-nl="${r}">${r}</button>`).join('')}</div>
        <p class="hint">표지·마지막 레이아웃은 기본 글 상자(제목, 요약 등) 자리를 그대로 두고 그림 칸만 나눕니다. 칸 크기는 편집 화면에서 모서리로 조절한 뒤 다시 등록할 수 있습니다.</p>
        <label class="switch"><input type="checkbox" id="nl-default" checked> 새 회차의 기본 레이아웃으로 쓰기</label>
        <div class="row"><button class="btn accent" id="nl-save">만들기</button></div>
      </div>
    </div>`, (b) => {
    const preview = () => { const tpl = layoutFromSpec($('#nl-kind', b).value, $('#nl-rows', b).value); $('#nl-prev', b).innerHTML = tplThumb(tpl, app.defaults); };
    b.addEventListener('input', preview);
    b.addEventListener('change', preview);
    b.addEventListener('click', (e) => { const x = e.target.closest('[data-nl]'); if (x) { $('#nl-rows', b).value = x.dataset.nl; preview(); } });
    $('#nl-save', b).addEventListener('click', () => {
      const kind = $('#nl-kind', b).value;
      const parts = layoutFromSpec(kind, $('#nl-rows', b).value);
      if (!parts.panels.length && kind === 'content') { toast('칸 수를 1 이상으로 적어 주세요. 예: 1,2'); return; }
      const tpl = { id: uid('tpl'), name: $('#nl-name', b).value.trim() || '내 레이아웃', kind, builtin: false, ...parts };
      app.templates.push(tpl); store.lsSet(LS.templates, app.templates);
      if ($('#nl-default', b).checked) { app.defaults.pageTemplates[kind] = tpl.id; store.lsSet(LS.defaults, app.defaults); }
      closeModal(); renderHome(); toast(`'${tpl.name}' 레이아웃을 만들었습니다.`);
    });
    preview();
  });
}
function exportTemplate(id) {
  const tpl = app.templates.find((x) => x.id === id);
  if (!tpl) return;
  const { builtin, ...data } = tpl;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'moatoon-layout', version: 1, templates: [data] }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${tpl.name.replace(/[\\/:*?"<>|]/g, '') || 'layout'}.moatoon-layout.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('레이아웃 파일을 내보냈습니다. (미리보기 화면에서는 저장이 막힐 수 있습니다)');
}

function startNew() {
  const ep = newEpisode(SAMPLE, '');
  openEpisode(ep);
  app.ui.tab = 'script'; saveUi();
  renderEditor(); save();
  toast('예시 스크립트로 새 회차를 만들었습니다. 왼쪽 스크립트를 고친 뒤 "배치 가이드 만들기"를 누르세요.');
}

// ── API 키: 두 칸을 나란히, 저장 상태와 연결 확인 결과를 보여 준다 ─────────
const KEY_INFO = {
  anthropic: { label: 'Anthropic (Claude) API 키', use: '대사 맞춤법·사실 검사, 캐릭터 활용 가이드, 그림 속 캐릭터 찾기', ph: 'sk-ant-…', where: 'console.anthropic.com → API Keys' },
  openai: { label: 'OpenAI API 키', use: '그림 편집: 배경 채우기, 캐릭터 오려 내기, 표정 바꾸기', ph: 'sk-… 또는 sk-proj-…', where: 'platform.openai.com → API keys' },
};
const keyKind = (v) => (/^sk-ant-/.test(v) ? 'anthropic' : /^sk-[A-Za-z0-9_-]{10,}/.test(v) ? 'openai' : '');
app.keyStatus = store.lsGet('moatoon.keystatus', {});
const keyValue = (kind) => (kind === 'anthropic' ? app.apiKey : app.openaiKey);
function setKey(kind, v) {
  if (kind === 'anthropic') { app.apiKey = v; saveKey(); } else { app.openaiKey = v; saveOpenai(); }
  app.keyStatus[kind] = { state: v ? 'saved' : '', at: Date.now() };
  store.lsSet('moatoon.keystatus', app.keyStatus);
}
function keyRow(kind) {
  const info = KEY_INFO[kind];
  const v = keyValue(kind);
  const st = app.keyStatus[kind] || {};
  const masked = v ? `${v.slice(0, kind === 'anthropic' ? 7 : 5)}…${v.slice(-4)}` : '';
  const status = !v ? '<span class="muted">○ 아직 없음</span>'
    : st.state === 'checking' ? '<span style="color:var(--warn)">… 확인하는 중</span>'
      : st.state === 'ok' ? `<span style="color:var(--ok)">✓ 연결 확인됨</span> <span class="muted">${esc(st.msg || '')}</span>`
        : st.state === 'fail' ? `<span style="color:var(--fix)">✕ 확인 실패</span> <span class="muted">${esc(st.msg || '')}</span>`
          : '<span>● 저장됨 · 아직 확인 안 함</span>';
  return `<div class="field" style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px">
    <span><b style="color:var(--fg)">${info.label}</b><br><small class="muted">${info.use}</small></span>
    <div class="row" style="flex-wrap:nowrap"><label class="sr-only" for="key-${kind}">${info.label}</label><input id="key-${kind}" data-key="${kind}" type="password" autocomplete="off" placeholder="${v ? '새 키로 바꾸려면 붙여 넣기' : info.ph}" style="flex:1"><button class="btn dark sm" data-keysave="${kind}">저장</button></div>
    <div class="row" style="font-size:12.5px">${status}${v ? ` <span class="muted">(${esc(masked)})</span><span class="grow"></span><button class="btn line sm" data-keytest="${kind}">연결 확인</button><button class="btn line sm" data-keydel="${kind}">지우기</button>` : ` <span class="muted">· 발급: ${info.where}</span>`}</div>
  </div>`;
}
function keysHTML() {
  return `${keyRow('anthropic')}${keyRow('openai')}<p class="hint">키는 이 브라우저에만 저장되고, 쓸 때 브라우저에서 각 회사 API로 바로 보냅니다. "연결 확인"은 모델 목록만 조회해서 요금이 들지 않습니다.</p>`;
}
function rerenderKeys() {
  const kb = $('#keys-box');
  if (kb && !$('#modal').hidden) kb.innerHTML = keysHTML();
  if (app.view === 'editor' && ['settings', 'imgedit'].includes(app.ui.tab)) { const sc = $('#side').scrollTop; renderSide(); $('#side').scrollTop = sc; }
}
async function testKey(kind) {
  const v = keyValue(kind);
  if (!v) return;
  app.keyStatus[kind] = { state: 'checking' }; rerenderKeys();
  try {
    if (kind === 'anthropic') {
      const ids = await testAnthropicKey(v);
      app.keyStatus[kind] = { state: 'ok', msg: ids.includes('claude-opus-5-5') ? 'claude-opus-5-5 사용 가능' : `모델 ${ids.length}개 조회됨`, at: Date.now() };
    } else {
      const ids = await testOpenAIKey(v);
      const imgModels = ids.filter((x) => /^gpt-image/.test(x));
      app.keyStatus[kind] = { state: 'ok', at: Date.now(), msg: ids.includes(app.openai.model) ? `${app.openai.model} 사용 가능` : imgModels.length ? `선택한 ${app.openai.model}은 목록에 없음 → 설정에서 ${imgModels[0]} 등으로 바꿔 보세요` : '키는 맞지만 이미지 모델이 목록에 보이지 않습니다. OpenAI 조직 인증·결제 등록이 필요할 수 있습니다' };
    }
  } catch (e) {
    const s = e && (e.status || e.statusCode);
    app.keyStatus[kind] = { state: 'fail', at: Date.now(), msg: s === 401 ? '키가 맞지 않습니다(401)' : (kind === 'anthropic' ? describeError(e) : e.message) };
  }
  store.lsSet('moatoon.keystatus', app.keyStatus);
  rerenderKeys();
  const st = app.keyStatus[kind];
  toast(`${KEY_INFO[kind].label}: ${st.state === 'ok' ? '연결 확인됨' : '확인 실패'} · ${st.msg}`);
}
function saveKeyFrom(kind) {
  const input = document.querySelector(`[data-key="${kind}"]`);
  const v = (input && input.value || '').trim();
  if (!v) { toast('키를 붙여 넣은 뒤 저장을 눌러 주세요.'); return; }
  const actual = keyKind(v);
  if (!actual) { toast('API 키 형식이 아닙니다. sk- 로 시작하는 키를 붙여 넣어 주세요.'); return; }
  if (actual !== kind) {
    setKey(actual, v);
    toast(`${KEY_INFO[actual].label}로 보여서 그 칸에 저장했습니다. (${actual === 'anthropic' ? 'sk-ant- 로 시작' : 'sk-ant- 가 아님'})`);
  } else {
    setKey(kind, v);
    toast(`${KEY_INFO[kind].label}를 저장했습니다. 연결을 확인합니다…`);
  }
  rerenderKeys();
  testKey(actual);
}
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-keysave]'); if (s) { saveKeyFrom(s.dataset.keysave); return; }
  const t = e.target.closest('[data-keytest]'); if (t) { testKey(t.dataset.keytest); return; }
  const d = e.target.closest('[data-keydel]');
  if (d) { setKey(d.dataset.keydel, ''); rerenderKeys(); toast(`${KEY_INFO[d.dataset.keydel].label}를 지웠습니다.`); }
});
document.addEventListener('keydown', (e) => { const k = e.target.closest && e.target.closest('[data-key]'); if (k && e.key === 'Enter') { e.preventDefault(); saveKeyFrom(k.dataset.key); } });
// 예전에 OpenAI 키를 Anthropic 칸에 넣었으면 제자리로 옮긴다
if (keyKind(app.apiKey) === 'openai') {
  if (!app.openaiKey) app.openaiKey = app.apiKey;
  app.apiKey = ''; saveKey(); saveOpenai();
  app.keyStatus = {}; store.lsSet('moatoon.keystatus', app.keyStatus);
  setTimeout(() => toast('Anthropic 칸에 있던 OpenAI 키를 OpenAI 칸으로 옮겼습니다. "연결 설정"에서 확인해 주세요.'), 1200);
}

function openConnSettings() {
  openModal('연결 설정', `
    <h3 style="font-size:14px">AI 키</h3>
    <div id="keys-box">${keysHTML()}</div>
    <h3 style="font-size:14px;margin-top:6px">Google 드라이브</h3>
    <label class="field"><span>Google OAuth 클라이언트 ID</span><input id="m-client" value="${esc(app.google.clientId)}" placeholder="…apps.googleusercontent.com"></label>
    <label class="field"><span>회차 폴더 주소 (선택)</span><input id="m-folder" value="${esc(app.google.folder)}" placeholder="https://drive.google.com/drive/folders/…"></label>
    <div class="row"><button class="btn accent" id="m-save">Google 설정 저장</button></div>`, (b) => {
    $('#m-save', b).addEventListener('click', () => {
      const cid = $('#m-client', b).value.trim();
      if (cid !== app.google.clientId) drive.disconnect();
      app.google = { clientId: cid, folder: $('#m-folder', b).value.trim() };
      store.lsSet(LS.google, app.google);
      app.driveFiles = null; app.drivePath = [];
      closeModal(); toast('Google 드라이브 설정을 저장했습니다.');
      if (app.view === 'home') renderHome();
    });
  });
}

// ══ 편집 화면 ═══════════════════════════════════════════════════════
const itemOf = (id) => {
  const pg = PG();
  for (const p of pg.panels) { const it = p.items.find((i) => i.id === id); if (it) return it; }
  return pg.texts.find((t) => t.id === id) || null;
};
const panelOf = (id) => PG().panels.find((p) => p.items.some((i) => i.id === id)) || null;
const panelAt = (x, y, pg = PG()) => pg.panels.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
const charOf = (item) => P().characters.find((c) => c.id === item.charId);
const style = () => S().style;

function resizeBubble(b, panel) {
  const keep = { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  Object.assign(b, sizeBubble(b, panel, S(), measure));
  b.x = Math.round(keep.cx - b.w / 2);
  b.y = Math.round(keep.cy - b.h / 2);
  placeBubble(panel, b, panel.items, style(), { ideal: { x: keep.cx, y: keep.cy }, pull: 3 });
}
function fitText(t) { Object.assign(t, layoutText(t, S(), measure)); }

function renderEditor() {
  if (!app.ep) return;
  $('#ep-name').value = app.ep.name;
  $('#btn-size').textContent = `${S().width}×${S().height} px`;
  const body = $('.ed-body');
  body.classList.toggle('side-closed', app.ui.sideClosed);
  body.classList.toggle('layers-closed', app.ui.layersClosed);
  $$('.rail .rail-btn[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === app.ui.tab && !app.ui.sideClosed));
  $('#toggle-guides').checked = app.ui.guides;
  renderSide();
  renderPages();
  renderLayers();
  updateUndoButtons();
}
function updateUndoButtons() { $('#btn-undo').disabled = !app.undo.length; $('#btn-redo').disabled = !app.redo.length; }

// ── 페이지 ───────────────────────────────────────────────────────────
function pageKindLabel(k) { return (PAGE_KINDS.find((x) => x.id === k) || PAGE_KINDS[1]).label; }
function renderPages() {
  const pages = P().pages;
  $('#pages').innerHTML = pages.map((pg, i) => `
    <section class="page-block ${i === app.page ? 'current' : ''}" data-page="${i}">
      <div class="page-head"><b>${i + 1} 페이지</b> - <span class="kind ${pg.kind}">${pageKindLabel(pg.kind)}</span><span class="grow"></span>
        <button class="icon-btn" data-pact="up" title="위로" aria-label="${i + 1}페이지 위로" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="icon-btn" data-pact="down" title="아래로" aria-label="${i + 1}페이지 아래로" ${i === pages.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
        <button class="icon-btn" data-pact="dup" title="복제" aria-label="${i + 1}페이지 복제"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/></svg></button>
        <button class="icon-btn" data-pact="register" title="이 페이지를 레이아웃으로 등록" aria-label="${i + 1}페이지를 레이아웃으로 등록"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18M10 10v11"/><circle cx="17" cy="17" r="0"/></svg></button>
        <button class="icon-btn" data-pact="delete" title="삭제" aria-label="${i + 1}페이지 삭제" ${pages.length === 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
      </div>
      <svg class="page-svg ${app.ui.guides ? '' : 'no-guides'}" data-page="${i}" xmlns="http://www.w3.org/2000/svg"></svg>
    </section>`).join('') + `<div class="add-page">${PAGE_KINDS.map((k) => `<button data-add="${k.id}">＋ ${k.label} 페이지 추가</button>`).join('')}</div>`;
  pages.forEach((_, i) => drawPage(i));
  applyZoom();
  $('#page-indicator').textContent = `${app.page + 1} / ${pages.length} 페이지`;
}

function drawPage(i, opts = {}) {
  const svg = $(`.page-svg[data-page="${i}"]`);
  if (!svg) return;
  const pg = P().pages[i];
  const { width, height, inner } = renderPage(pg, { project: P(), settings: S(), assets: app.assets, index: i, total: P().pages.length, opts: { guides: app.ui.guides, fast: opts.fast, editor: true } });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  let sel = '';
  if (i === app.page && !opts.noSel) sel = selectionSVG();
  svg.innerHTML = inner + sel + (opts.extra || '');
}
function drawCurrent(opts) { drawPage(app.page, opts); renderToolbar(); renderLayers(); }
function markCurrent() {
  $$('.page-block').forEach((b) => b.classList.toggle('current', Number(b.dataset.page) === app.page));
  $('#page-indicator').textContent = `${app.page + 1} / ${P().pages.length} 페이지`;
}

function selectionSVG() {
  const s = app.selected;
  if (!s) return '';
  if (s.kind === 'item') {
    const it = itemOf(s.id);
    if (!it) { app.selected = null; return ''; }
    const b = it.type === 'character' ? characterBox(it, style()) : it;
    return `<rect class="sel-box" x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="8"/>` + handlesSVG(b);
  }
  if (s.kind === 'panel') {
    const p = PG().panels.find((x) => x.id === s.id);
    if (p) return `<rect class="sel-box" x="${p.x - 5}" y="${p.y - 5}" width="${p.w + 10}" height="${p.h + 10}"/>` + handlesSVG(p);
  }
  return '';
}

const CORNERS = { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] };
function handlesSVG(b) {
  const k = app.zoom || 1;
  const s = 14 / k, hit = 28 / k;
  return Object.entries(CORNERS).map(([c, [fx, fy]]) => {
    const x = b.x - 6 + (b.w + 12) * fx, y = b.y - 6 + (b.h + 12) * fy;
    return `<g class="handle" data-corner="${c}"><rect x="${x - hit / 2}" y="${y - hit / 2}" width="${hit}" height="${hit}" fill="transparent"/><rect class="handle-dot" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" stroke-width="${2 / k}"/></g>`;
  }).join('');
}

function resizeTo(r, pt, keepRatio) {
  const it = itemOf(r.id);
  const panel = panelOf(r.id);
  const [fx, fy] = CORNERS[r.corner];
  const ax = r.box.x + r.box.w * (1 - fx), ay = r.box.y + r.box.h * (1 - fy);
  if (it.type === 'character') {
    const k = Math.max(Math.abs(pt.x - ax) / r.box.w, Math.abs(pt.y - ay) / r.box.h);
    it.size = Math.round(Math.max(30, r.size * k));
    const nb = characterBox(it, style());
    const left = fx ? ax : ax - nb.w, top = fy ? ay : ay - nb.h;
    it.x = Math.round(left + nb.w / 2);
    it.y = Math.round(top + nb.h);
    return;
  }
  const bounds = panel || { x: 0, y: 0, w: S().width, h: S().height };
  let w = Math.max(MIN_BUBBLE.w, Math.abs(pt.x - ax)), h = Math.max(MIN_BUBBLE.h, Math.abs(pt.y - ay));
  if (keepRatio || it.type === 'sticker') { const k = Math.max(w / r.box.w, h / r.box.h); w = r.box.w * k; h = r.box.h * k; }
  if (it.type !== 'sticker') w = Math.min(w, fx ? bounds.x + bounds.w - ax : ax - bounds.x);
  if (it.type !== 'sticker') h = Math.min(h, fy ? bounds.y + bounds.h - ay : ay - bounds.y);
  it.w = Math.round(w); it.h = Math.round(h);
  it.x = Math.round(fx ? ax : ax - it.w);
  it.y = Math.round(fy ? ay : ay - it.h);
  if (it.type === 'bubble') { it.manual = true; Object.assign(it, sizeBubble(it, panel, S(), measure)); }
  else if (it.type === 'text') fitText(it);
}

// ── 컷 크기 조절과 배율 ─────────────────────────────────────────────
// 컷 모서리를 끌면 반대쪽 모서리를 고정하고 컷 크기를 바꾼다. 안의 인물·말풍선은 처음 크기 기준 비율로 따라 움직인다.
function mapPanelItems(panel, o, items, focus, drop) {
  const sx = panel.w / o.w, sy = panel.h / o.h, k = Math.min(sx, sy);
  const mx = (x) => panel.x + (x - o.x) * sx, my = (y) => panel.y + (y - o.y) * sy;
  panel.items = items.map((it) => {
    const n = { ...it, x: mx(it.x), y: my(it.y) };
    if (it.type === 'character') { n.x = mx(it.x); n.size = Math.max(30, it.size * k); }
    if (it.type === 'bubble' && it.manual) { n.w = Math.min(it.w, panel.w - 16); n.h = Math.min(it.h, panel.h - 16); }
    return n;
  });
  if (focus) panel.focus = { x: mx(focus.x), y: my(focus.y) };
  if (drop) panel.drop = drop * k;
}
function resizePanelTo(r, pt, keepRatio) {
  const panel = PG().panels.find((p) => p.id === r.panelId);
  const o = r.orig, [fx, fy] = CORNERS[r.corner];
  const ax = o.x + o.w * (1 - fx), ay = o.y + o.h * (1 - fy);
  const W = S().width, H = S().height, MIN = 80;
  let w = Math.max(MIN, Math.abs(pt.x - ax)), h = Math.max(MIN, Math.abs(pt.y - ay));
  if (keepRatio) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; }
  w = Math.min(w, fx ? W - ax : ax);
  h = Math.min(h, fy ? H - ay : ay);
  Object.assign(panel, { x: Math.round(fx ? ax : ax - w), y: Math.round(fy ? ay : ay - h), w: Math.round(w), h: Math.round(h) });
  mapPanelItems(panel, o, r.items, r.focus, r.drop);
}

// 배율: 클로즈업 장면에서 컷 안의 그림(배경·인물)을 기준점(인물 얼굴) 쪽으로 키운다. 말풍선 글자 크기는 그대로.
function defaultFocus(panel) {
  const heads = panel.items.filter((i) => i.type === 'character').map((c) => headBox(c, style()));
  if (!heads.length) return { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
  return { x: heads.reduce((a, h) => a + h.cx, 0) / heads.length, y: heads.reduce((a, h) => a + h.cy, 0) / heads.length };
}
function setPanelZoom(panel, z) {
  const z0 = panel.zoom || 1;
  if (!panel.focus || z0 === 1) panel.focus = defaultFocus(panel);
  const f = panel.focus, k = z / z0;
  for (const it of panel.items) {
    if (it.type !== 'character') continue;
    it.x = f.x + (it.x - f.x) * k;
    it.y = f.y + (it.y - f.y) * k;
    it.size = Math.max(10, it.size * k);
  }
  panel.zoom = Math.round(z * 100) / 100;
  if (panel.zoom === 1) { delete panel.zoom; delete panel.focus; }
}

// ── 확대·축소 ────────────────────────────────────────────────────────
function fitZoom() {
  const area = $('#canvas-area');
  const k = Math.min((area.clientWidth - 90) / S().width, (area.clientHeight - 100) / S().height, 1);
  return Math.max(0.1, k);
}
function applyZoom() {
  if (app.zoomFit) app.zoom = fitZoom();
  $$('.page-svg').forEach((svg) => { svg.style.width = `${Math.round(S().width * app.zoom)}px`; svg.style.height = `${Math.round(S().height * app.zoom)}px`; });
  $('.add-page').style.width = `${Math.round(S().width * app.zoom)}px`;
  $('#zoom-fit').textContent = `${Math.round(app.zoom * 100)}%`;
  positionToolbar();
}
function setZoom(z) { app.zoomFit = false; app.zoom = Math.max(0.1, Math.min(3, z)); applyZoom(); drawPage(app.page); }

// ── 선택 툴바 ────────────────────────────────────────────────────────
function opt(list, cur) { return list.map((o) => `<option value="${esc(o.id)}" ${o.id === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join(''); }
function renderToolbar() {
  const tb = $('#toolbar');
  const s = app.selected;
  let html = '';
  if (s && s.kind === 'item') {
    const it = itemOf(s.id);
    if (!it) { tb.hidden = true; return; }
    if (it.type === 'sticker') {
      const ch = P().characters.find((c) => c.id === it.charId);
      const exprs = (ch?.images || []);
      html = `<span class="lbl">${esc(it.name || '캐릭터')} 레이어</span>
        <select data-act="stk-char" aria-label="캐릭터">${opt([{ id: '', label: '캐릭터 고르기' }, ...P().characters.map((c) => ({ id: c.id, label: c.name }))], it.charId || '')}</select>
        ${exprs.length ? `<select data-act="stk-expr" aria-label="바꿀 표정">${opt([{ id: '', label: '표정 고르기' }, ...exprs.map((v) => ({ id: v.id, label: v.label || EMOTIONS.find((e) => e.id === v.emotion)?.label || '표정' }))], '')}</select>` : '<span class="lbl">업로드 탭에서 표정 이미지를 등록하세요</span>'}
        ${it.versions && it.versions.length ? '<button class="btn" data-act="stk-undo">이전 버전</button>' : ''}
        <button class="btn danger" data-act="delete">빼기</button>`;
    } else if (it.type === 'region') {
      html = `<span class="lbl">영역</span><select data-act="rg-kind" aria-label="영역 종류">${opt([{ id: 'character', label: '캐릭터(레이어로 분리)' }, { id: 'bubble', label: '지울 곳(말풍선·글자)' }], it.kind)}</select>
        <button class="btn danger" data-act="delete">삭제</button>`;
    } else if (it.type === 'character') {
      const ch = charOf(it);
      const variants = (ch?.images || []);
      html = `<span class="lbl">${esc(ch?.name || '인물')}</span>
        <select data-act="emotion" aria-label="감정">${opt(EMOTIONS, it.emotion)}</select>
        ${variants.length ? `<select data-act="variant" aria-label="이미지">${opt([{ id: '', label: '감정에 맞는 이미지' }, ...variants.map((v) => ({ id: v.id, label: v.label || `${EMOTIONS.find((e) => e.id === v.emotion)?.label || ''} 이미지` }))], it.variantId || '')}</select>` : `<select data-act="action" aria-label="동작">${opt(ACTIONS, it.action)}</select>`}
        <button class="btn" data-act="flip">반전</button>
        <button class="btn" data-act="bigger" aria-label="크게">＋</button>
        <button class="btn" data-act="smaller" aria-label="작게">－</button>
        <button class="btn" data-act="say">대사 추가</button>
        <button class="btn danger" data-act="delete">삭제</button>`;
    } else if (it.type === 'bubble') {
      const panel = panelOf(it.id);
      const targets = [{ id: '', label: '꼬리 없음' }, ...panel.items.filter((o) => o.type === 'character' || o.type === 'sticker').map((o) => ({ id: o.id, label: `→ ${o.type === 'sticker' ? o.name || '캐릭터' : charOf(o)?.name || '인물'}` }))];
      html = `<select data-act="kind" aria-label="말풍선 종류">${opt(BUBBLES, it.kind)}</select>
        <select data-act="tail" aria-label="말하는 인물">${opt(targets, it.tailTo || '')}</select>
        <select data-act="role" aria-label="글꼴">${opt(FONT_ROLES, bubbleRole(it))}</select>
        <button class="btn" data-act="edit">고치기</button>
        ${it.manual ? '<button class="btn" data-act="autosize">자동 크기</button>' : ''}
        <button class="btn danger" data-act="delete">삭제</button>`;
    } else {
      html = `<select data-act="trole" aria-label="글꼴">${opt(FONT_ROLES, it.role)}</select>
        <select data-act="align" aria-label="정렬">${opt([{ id: 'left', label: '왼쪽' }, { id: 'center', label: '가운데' }, { id: 'right', label: '오른쪽' }], it.align)}</select>
        <button class="btn" data-act="tbig" aria-label="글자 크게">가＋</button>
        <button class="btn" data-act="tsmall" aria-label="글자 작게">가－</button>
        <label class="lbl"><input type="checkbox" data-act="tbox" ${it.box ? 'checked' : ''}> 상자</label>
        <input type="color" data-act="tcolor" value="${esc(it.color || '#1b1f2a')}" aria-label="글자 색">
        <button class="btn" data-act="edit">고치기</button>
        <button class="btn danger" data-act="delete">삭제</button>`;
    }
  } else if (s && s.kind === 'panel') {
    const p = PG().panels.find((x) => x.id === s.id);
    if (!p) { tb.hidden = true; return; }
    html = `<span class="lbl">${PG().panels.indexOf(p) + 1}컷</span>
      <select data-act="bg" aria-label="배경 가이드">${opt(BACKGROUNDS, p.background.kind)}</select>
      <span class="lbl">배율</span><input type="range" data-act="zoom" min="1" max="3" step="0.1" value="${p.zoom || 1}" aria-label="컷 배율 (클로즈업)" style="width:90px"><span class="lbl" id="zoom-val">${(p.zoom || 1).toFixed(1)}×</span>
      <label class="lbl"><input type="checkbox" data-act="night" ${p.background.night ? 'checked' : ''}> 밤</label>
      ${p.bgImage ? '<button class="btn" data-act="bgclear">배경 이미지 빼기</button>' : ''}
      <button class="btn" data-act="narr">내레이션 추가</button>
      <button class="btn" data-act="tidy">말풍선 정리</button>`;
  } else { tb.hidden = true; return; }
  tb.innerHTML = html;
  tb.hidden = false;
  positionToolbar();
}
function positionToolbar() {
  const tb = $('#toolbar');
  if (tb.hidden) return;
  const area = $('#canvas-area');
  const box = $(`.page-svg[data-page="${app.page}"] .sel-box`);
  if (!box) { tb.hidden = true; return; }
  const r = box.getBoundingClientRect(), a = area.getBoundingClientRect();
  const tbw = tb.offsetWidth, tbh = tb.offsetHeight;
  let left = r.left - a.left + area.scrollLeft + r.width / 2 - tbw / 2;
  let top = r.top - a.top + area.scrollTop - tbh - 10;
  if (top < area.scrollTop + 4) top = r.bottom - a.top + area.scrollTop + 10;
  left = Math.max(area.scrollLeft + 8, Math.min(left, area.scrollLeft + area.clientWidth - tbw - 8));
  tb.style.left = `${left}px`; tb.style.top = `${top}px`;
}

function addBubble(panel, kind, tailTo, text) {
  const b = { id: uid('i'), type: 'bubble', kind, text, tailTo, x: panel.x, y: panel.y, w: 10, h: 10 };
  Object.assign(b, sizeBubble(b, panel, S(), measure));
  const prev = panel.items.filter((o) => o.type === 'bubble').pop();
  placeBubble(panel, b, panel.items, style(), { prev });
  panel.items.push(b);
  return b;
}
function deleteItem(id) {
  const pg = PG();
  const p = panelOf(id);
  if (p) { p.items = p.items.filter((o) => o.id !== id); for (const o of p.items) if (o.tailTo === id) o.tailTo = null; }
  pg.texts = pg.texts.filter((t) => t.id !== id);
  if (app.selected && app.selected.id === id) app.selected = null;
}

let zoomSnap = false;
function bindToolbar() {
  const tb = $('#toolbar');
  const run = (act, value) => {
    const s = app.selected;
    if (!s) return;
    if (act !== 'zoom') snapshot();
    if (s.kind === 'panel') {
      const p = PG().panels.find((x) => x.id === s.id);
      if (act === 'zoom') { zoomSnap = false; setPanelZoom(p, Number(value)); reflowBubbles(p, style(), S(), measure); toast(p.zoom ? `배율 ${p.zoom.toFixed(1)}× : 인물 얼굴을 기준으로 키웠습니다. 말풍선 글자 크기는 그대로입니다.` : '배율을 원래대로 돌렸습니다.'); }
      if (act === 'bg') { const b = BACKGROUNDS.find((x) => x.id === value); p.background = { ...p.background, kind: value, label: b.label }; }
      if (act === 'night') p.background.night = value;
      if (act === 'bgclear') delete p.bgImage;
      if (act === 'narr') addBubble(p, 'narration', null, '내레이션을 입력하세요');
      if (act === 'tidy') reflowBubbles(p, style(), S(), measure, false);
    } else {
      const it = itemOf(s.id), panel = panelOf(s.id);
      if (act === 'delete') deleteItem(it.id);
      else if (it.type === 'sticker') {
        if (act === 'stk-char') it.charId = value || null;
        if (act === 'stk-undo' && it.versions.length) it.assetId = it.versions.pop();
        if (act === 'stk-expr' && value) { app.undo.pop(); runExpression(it, value); return; }
      } else if (it.type === 'region') {
        if (act === 'rg-kind') it.kind = value;
      } else if (it.type === 'character') {
        if (act === 'emotion') { it.emotion = value; updateItemImage(it); reflowBubbles(panel, style(), S(), measure); }
        if (act === 'variant') { if (value) it.variantId = value; else delete it.variantId; updateItemImage(it); reflowBubbles(panel, style(), S(), measure); }
        if (act === 'action') { it.action = value; reflowBubbles(panel, style(), S(), measure); }
        if (act === 'flip') it.flip = !it.flip;
        if (act === 'bigger' || act === 'smaller') { it.size = Math.round(Math.max(30, it.size * (act === 'bigger' ? 1.12 : 0.89))); reflowBubbles(panel, style(), S(), measure); }
        if (act === 'say') { const b = addBubble(panel, 'speech', it.id, '대사를 입력하세요'); app.selected = { kind: 'item', id: b.id }; drawCurrent(); save(); startInlineEdit(b.id); return; }
      } else if (it.type === 'bubble') {
        if (act === 'kind') { it.kind = value; delete it.fontRole; resizeBubble(it, panel); }
        if (act === 'tail') { it.tailTo = value || null; placeBubble(panel, it, panel.items, style(), { ideal: { x: it.x + it.w / 2, y: it.y + it.h / 2 }, pull: 2 }); }
        if (act === 'role') { it.fontRole = value; resizeBubble(it, panel); }
        if (act === 'autosize') { delete it.manual; resizeBubble(it, panel); }
        if (act === 'edit') { app.undo.pop(); startInlineEdit(it.id); return; }
      } else {
        if (act === 'trole') it.role = value;
        if (act === 'align') it.align = value;
        if (act === 'tbig') it.sizeScale = Math.min(4, (it.sizeScale || 1) * 1.12);
        if (act === 'tsmall') it.sizeScale = Math.max(0.3, (it.sizeScale || 1) * 0.89);
        if (act === 'tbox') it.box = value;
        if (act === 'tcolor') it.color = value;
        if (act === 'edit') { app.undo.pop(); startInlineEdit(it.id); return; }
        fitText(it);
      }
    }
    drawCurrent(); afterChange();
  };
  tb.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) run(b.dataset.act); });
  tb.addEventListener('change', (e) => { const el = e.target; if (el.dataset.act) run(el.dataset.act, el.type === 'checkbox' ? el.checked : el.value); });
  // 배율 슬라이더는 끄는 동안 바로 보여 준다
  tb.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.act !== 'zoom' || app.selected?.kind !== 'panel') return;
    const p = PG().panels.find((x) => x.id === app.selected.id);
    if (!zoomSnap) { snapshot(); zoomSnap = true; }
    setPanelZoom(p, Number(el.value));
    $('#zoom-val').textContent = `${Number(el.value).toFixed(1)}×`;
    drawPage(app.page, { fast: true });
  });
}
function afterChange() {
  updateUndoButtons(); save();
  if (app.ui.tab === 'guide') renderSide();
}

// ── 바로 고치기 ──────────────────────────────────────────────────────
function startInlineEdit(id) {
  const ta = $('#inline-edit');
  const svg = $(`.page-svg[data-page="${app.page}"]`), area = $('#canvas-area');
  let box, text, family, size;
  if (id === 'title') {
    const tH = S().fonts.title.size * 1.9;
    box = { x: S().margin, y: S().margin, w: S().width - S().margin * 2, h: tH };
    text = P().title; family = S().fonts.title.family; size = S().fonts.title.size;
  } else {
    const it = itemOf(id);
    if (!it || it.type === 'character') return;
    box = it; text = it.text;
    const f = it.type === 'bubble' ? S().fonts[bubbleRole(it)] : (S().fonts[it.role] || S().fonts.dialogue);
    family = f.family; size = it.fontSize || f.size;
  }
  const k = app.zoom;
  const sr = svg.getBoundingClientRect(), ar = area.getBoundingClientRect();
  const w = Math.max(200, box.w * k), h = Math.max(70, box.h * k);
  ta.style.left = `${sr.left - ar.left + area.scrollLeft + box.x * k + (box.w * k) / 2 - w / 2}px`;
  ta.style.top = `${sr.top - ar.top + area.scrollTop + box.y * k + (box.h * k) / 2 - h / 2}px`;
  ta.style.width = `${w}px`; ta.style.height = `${h}px`;
  ta.style.fontFamily = `'${family}', sans-serif`;
  ta.style.fontSize = `${Math.max(13, size * k)}px`;
  ta.value = text; ta.dataset.id = id; ta.hidden = false;
  ta.focus(); ta.select();
}
function commitInlineEdit(cancel) {
  const ta = $('#inline-edit');
  if (ta.hidden) return;
  ta.hidden = true;
  const id = ta.dataset.id;
  const val = ta.value.replace(/\s+$/, '');
  if (cancel) return;
  if (id === 'title') {
    if (val === P().title) return;
    snapshot(); P().title = val;
  } else {
    const it = itemOf(id);
    if (!it || val === it.text) return;
    snapshot();
    it.text = val || '…';
    if (it.type === 'bubble') { resizeBubble(it, panelOf(id)); delete app.ai[id]; } else fitText(it);
  }
  drawCurrent(); afterChange();
}

// ── 캔버스 조작 ──────────────────────────────────────────────────────
function svgPoint(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function bindCanvas() {
  const pagesEl = $('#pages');
  let drag = null, resize = null;
  pagesEl.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest('.page-svg');
    if (!svg) return;
    if (!$('#inline-edit').hidden) commitInlineEdit();
    const i = Number(svg.dataset.page);
    if (i !== app.page) { const old = app.page; app.page = i; app.selected = null; drawPage(old); markCurrent(); if (['layout', 'settings'].includes(app.ui.tab)) renderSide(); }
    const pt = svgPoint(e, svg);
    const h = e.target.closest('.handle');
    if (h && app.selected?.kind === 'panel') {
      const p = PG().panels.find((x) => x.id === app.selected.id);
      resize = { svg, panelId: p.id, corner: h.dataset.corner, orig: { x: p.x, y: p.y, w: p.w, h: p.h }, items: clone(p.items), focus: p.focus && { ...p.focus }, drop: p.drop, moved: false };
      svg.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    if (h && app.selected?.kind === 'item') {
      const it = itemOf(app.selected.id);
      const box = it.type === 'character' ? characterBox(it, style()) : { x: it.x, y: it.y, w: it.w, h: it.h };
      resize = { svg, id: it.id, corner: h.dataset.corner, box, size: it.size, moved: false };
      svg.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    const g = e.target.closest('.item');
    if (g && g.dataset.id === 'title') { app.selected = { kind: 'title', id: 'title' }; drawCurrent(); return; }
    if (g) {
      const it = itemOf(g.dataset.id);
      if (!it) return;
      app.selected = { kind: 'item', id: it.id };
      drag = { svg, id: it.id, sx: pt.x, sy: pt.y, ox: it.x, oy: it.y, moved: false };
      svg.setPointerCapture(e.pointerId);
      drawCurrent(); highlightGuide(it.id);
      return;
    }
    const p = panelAt(pt.x, pt.y);
    app.selected = p ? { kind: 'panel', id: p.id } : null;
    drawCurrent();
  });
  pagesEl.addEventListener('pointermove', (e) => {
    if (resize) {
      if (!resize.moved) { snapshot(); resize.moved = true; $('#toolbar').hidden = true; }
      if (resize.panelId) resizePanelTo(resize, svgPoint(e, resize.svg), e.shiftKey);
      else resizeTo(resize, svgPoint(e, resize.svg), e.shiftKey);
      drawPage(app.page, { fast: true });
      return;
    }
    if (!drag) return;
    const pt = svgPoint(e, drag.svg);
    const dx = pt.x - drag.sx, dy = pt.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { snapshot(); drag.moved = true; $('#toolbar').hidden = true; }
    const it = itemOf(drag.id);
    it.x = Math.round(drag.ox + dx); it.y = Math.round(drag.oy + dy);
    const target = it.type === 'text' ? null : panelAt(pt.x, pt.y);
    drawPage(app.page, { fast: true, noSel: true, extra: target ? `<rect class="drop-hl" x="${target.x}" y="${target.y}" width="${target.w}" height="${target.h}"/>` : '' });
  });
  const end = (e) => {
    if (resize) {
      const r = resize; resize = null;
      if (!r.moved) return;
      if (r.panelId) {
        const p = PG().panels.find((x) => x.id === r.panelId);
        let prev = null;
        for (const b of p.items.filter((x) => x.type === 'bubble')) {
          Object.assign(b, sizeBubble(b, p, S(), measure));
          placeBubble(p, b, p.items, style(), { prev, ideal: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, pull: 2 });
          prev = b;
        }
        drawCurrent(); afterChange();
        toast('컷 크기를 바꿨습니다. 인물과 말풍선이 따라 움직였습니다. (Shift: 비율 유지)');
        return;
      }
      const it = itemOf(r.id);
      if (it.type === 'character') reflowBubbles(panelOf(r.id), style(), S(), measure);
      drawCurrent(); afterChange();
      return;
    }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    const pt = svgPoint(e, d.svg);
    const it = itemOf(d.id);
    if (it.type === 'sticker' || it.type === 'region') {
      const out = pt.x < 0 || pt.y < 0 || pt.x > S().width || pt.y > S().height;
      if (out) { deleteItem(it.id); drawCurrent(); afterChange(); toast(it.type === 'sticker' ? `${it.name || '캐릭터'}을(를) 뺐습니다. 뒤 배경은 이미 채워져 있습니다. (Ctrl+Z로 되돌리기)` : '영역을 지웠습니다.'); return; }
      if (it.type === 'region') { const p = panelOf(it.id); it.x = Math.round(Math.max(p.x, Math.min(p.x + p.w - it.w, it.x))); it.y = Math.round(Math.max(p.y, Math.min(p.y + p.h - it.h, it.y))); }
      drawCurrent(); afterChange();
      return;
    }
    if (it.type === 'text') {
      it.x = Math.round(Math.max(0, Math.min(S().width - it.w, it.x)));
      it.y = Math.round(Math.max(0, Math.min(S().height - it.h, it.y)));
      drawCurrent(); afterChange();
      return;
    }
    const from = panelOf(d.id);
    const to = panelAt(pt.x, pt.y) || from;
    if (to !== from) {
      from.items = from.items.filter((o) => o.id !== it.id);
      for (const o of from.items) if (o.tailTo === it.id) o.tailTo = null;
      to.items.push(it);
      if (it.type === 'bubble' && it.tailTo && !to.items.some((o) => o.id === it.tailTo)) it.tailTo = nearestCharacter(to, it.x, it.y)?.id || null;
    }
    if (it.type === 'character') {
      refineCharacter(to, it, to.items, style(), { keepSize: to === from, free: e.altKey || (to.zoom || 1) > 1, keepFlip: to === from });
      reflowBubbles(to, style(), S(), measure);
    } else {
      if (to !== from) Object.assign(it, sizeBubble(it, to, S(), measure));
      if (!e.altKey) placeBubble(to, it, to.items, style(), { ideal: { x: it.x + it.w / 2, y: it.y + it.h / 2 }, pull: 2 });
    }
    drawCurrent(); afterChange();
  };
  pagesEl.addEventListener('pointerup', end);
  pagesEl.addEventListener('pointercancel', end);
  pagesEl.addEventListener('dblclick', (e) => {
    const g = e.target.closest('.item');
    if (g && (g.classList.contains('bubble') || g.classList.contains('text') || g.dataset.id === 'title')) startInlineEdit(g.dataset.id);
  });
  // 페이지 머리 버튼, 페이지 추가
  pagesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pact]');
    if (b) { pageAction(Number(b.closest('.page-block').dataset.page), b.dataset.pact, b); return; }
    const a = e.target.closest('[data-add]');
    if (a) {
      snapshot();
      const pg = blankPage(a.dataset.add, S(), app.templates, measure, { title: P().title, episode: P().episode, subtitle: '', summary: [] });
      const at = a.dataset.add === 'cover' ? 0 : P().pages.length;
      P().pages.splice(at, 0, pg);
      app.page = at; app.selected = null;
      renderPages(); renderLayers(); afterChange();
      $(`.page-block[data-page="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  // 재료 끌어 놓기
  pagesEl.addEventListener('dragover', (e) => {
    const svg = e.target.closest('.page-svg');
    if (!svg) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    $$('.page-svg.drop-ok').forEach((s) => s !== svg && s.classList.remove('drop-ok'));
    svg.classList.add('drop-ok');
  });
  pagesEl.addEventListener('dragleave', (e) => { const svg = e.target.closest('.page-svg'); if (svg && !svg.contains(e.relatedTarget)) svg.classList.remove('drop-ok'); });
  pagesEl.addEventListener('drop', (e) => {
    const svg = e.target.closest('.page-svg');
    if (!svg) return;
    e.preventDefault();
    svg.classList.remove('drop-ok');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain')); } catch { return; }
    const i = Number(svg.dataset.page);
    if (i !== app.page) { const old = app.page; app.page = i; app.selected = null; drawPage(old); markCurrent(); }
    const pt = svgPoint(e, svg);
    const hitEl = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest('.item')).find(Boolean);
    applyMaterial(data, panelAt(pt.x, pt.y), pt, hitEl ? itemOf(hitEl.dataset.id) : null);
  });
}

function pageAction(i, act, btn) {
  const pages = P().pages;
  if (act === 'register') { const prev = app.page; app.page = i; app.selected = null; drawPage(prev); drawPage(i); markCurrent(); registerLayoutDialog(); return; }
  if (act === 'delete' && btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.style.color = 'var(--fix)'; toast('한 번 더 누르면 이 페이지를 삭제합니다.'); return; }
  snapshot();
  if (act === 'up' && i > 0) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; app.page = i - 1; }
  if (act === 'down' && i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; app.page = i + 1; }
  if (act === 'dup') {
    const copy = clone(pages[i]);
    const remap = {};
    copy.id = uid('pg');
    for (const p of copy.panels) { p.id = uid('p'); for (const it of p.items) { const n = uid('i'); remap[it.id] = n; it.id = n; } }
    for (const p of copy.panels) for (const it of p.items) if (it.tailTo) it.tailTo = remap[it.tailTo] || null;
    for (const t of copy.texts) t.id = uid('t');
    pages.splice(i + 1, 0, copy); app.page = i + 1;
  }
  if (act === 'delete' && pages.length > 1) { pages.splice(i, 1); app.page = Math.min(i, pages.length - 1); }
  app.selected = null;
  renderPages(); renderLayers(); afterChange();
}

// 재료를 페이지에 적용한다. 놓은 자리를 기준으로 조금 다듬는다.
function applyMaterial({ kind, value }, panel, pt, hit) {
  const needPanel = ['character', 'bubble', 'background', 'bgasset', 'variant'].includes(kind) || ((kind === 'emotion' || kind === 'action') && !(hit && hit.type === 'character'));
  if (needPanel && !panel) { toast('컷 안에 놓아 주세요.'); return; }
  snapshot();
  let msg = '';
  if (kind === 'character' || kind === 'variant') {
    const [charId, variantId] = kind === 'variant' ? value.split('|') : [value, null];
    const ch = P().characters.find((c) => c.id === charId);
    if (kind === 'variant' && hit && hit.type === 'character' && hit.charId === charId) {
      hit.variantId = variantId; updateItemImage(hit); reflowBubbles(panelOf(hit.id), style(), S(), measure);
      app.selected = { kind: 'item', id: hit.id };
      msg = `${ch.name}의 이미지를 바꿨습니다.`;
    } else {
      const count = panel.items.filter((o) => o.type === 'character').length;
      const it = { id: uid('i'), type: 'character', charId: ch.id, emotion: 'neutral', action: 'stand', x: pt.x, y: groundY(panel), size: defaultCharSize(panel, count + 1), flip: false };
      if (variantId) { it.variantId = variantId; it.emotion = ch.images.find((v) => v.id === variantId)?.emotion || 'neutral'; }
      updateItemImage(it);
      refineCharacter(panel, it, panel.items, style(), { keepSize: true });
      if ((panel.zoom || 1) > 1) { const f = panel.focus; it.size *= panel.zoom; it.y = f.y + (it.y - f.y) * panel.zoom; }
      panel.items.push(it);
      reflowBubbles(panel, style(), S(), measure);
      app.selected = { kind: 'item', id: it.id };
      msg = `${ch.name}: 바닥선에 세우고 다른 인물과 겹치지 않게 놓았습니다.`;
    }
  } else if (kind === 'emotion' || kind === 'action') {
    const target = hit && hit.type === 'character' ? hit : (hit && hit.tailTo ? itemOf(hit.tailTo) : nearestCharacter(panel, pt.x, pt.y));
    if (!target) { app.undo.pop(); toast('이 컷에 인물이 없습니다. 먼저 캐릭터를 놓아 주세요.'); return; }
    target[kind] = value;
    if (kind === 'emotion') { delete target.variantId; updateItemImage(target); }
    reflowBubbles(panelOf(target.id), style(), S(), measure);
    app.selected = { kind: 'item', id: target.id };
    const label = (kind === 'emotion' ? EMOTIONS : ACTIONS).find((x) => x.id === value).label;
    msg = `${charOf(target)?.name || '인물'}에게 '${label}'을(를) 적용했습니다.`;
    if (kind === 'action' && target.aspect) msg += ' (업로드 이미지 인물은 동작 대신 이미지를 바꿔 주세요)';
  } else if (kind === 'bubble') {
    if (hit && hit.type === 'bubble') {
      hit.kind = value; delete hit.fontRole; resizeBubble(hit, panel);
      app.selected = { kind: 'item', id: hit.id }; msg = '말풍선 모양을 바꿨습니다.';
    } else {
      const speaker = value === 'narration' ? null : (hit && hit.type === 'character' ? hit : nearestCharacter(panel, pt.x, pt.y));
      const b = { id: uid('i'), type: 'bubble', kind: value, text: value === 'narration' ? '내레이션을 입력하세요' : '대사를 입력하세요', tailTo: speaker ? speaker.id : null, x: pt.x, y: pt.y, w: 10, h: 10 };
      Object.assign(b, sizeBubble(b, panel, S(), measure));
      placeBubble(panel, b, panel.items, style(), { ideal: { x: pt.x, y: pt.y }, pull: 2 });
      panel.items.push(b);
      app.selected = { kind: 'item', id: b.id };
      drawCurrent(); afterChange();
      startInlineEdit(b.id);
      return;
    }
  } else if (kind === 'font') {
    if (!hit || hit.type === 'character') { app.undo.pop(); toast('폰트는 말풍선이나 글 상자 위에 놓아 주세요.'); return; }
    if (hit.type === 'bubble') { hit.fontRole = value; resizeBubble(hit, panelOf(hit.id)); } else { hit.role = value; fitText(hit); }
    app.selected = { kind: 'item', id: hit.id };
    msg = `${FONT_ROLES.find((r) => r.id === value).label} 글꼴을 입혔습니다.`;
  } else if (kind === 'background') {
    const bg = BACKGROUNDS.find((x) => x.id === value);
    panel.background = { ...panel.background, kind: value, label: bg.label };
    delete panel.bgImage;
    app.selected = { kind: 'panel', id: panel.id };
    msg = `배경을 '${bg.label}'(으)로 바꿨습니다.`;
  } else if (kind === 'bgasset') {
    panel.bgImage = value;
    app.selected = { kind: 'panel', id: panel.id };
    msg = '컷 배경에 이미지를 채웠습니다. (컷에 맞게 잘려 보이고 원본은 그대로입니다)';
  } else if (kind === 'text') {
    const [role, box] = value.split('|');
    const W = S().width;
    const w = box ? W * 0.6 : W * 0.5, h = box ? S().height * 0.2 : S().fonts[role].size * 2;
    const t = makeText({ slot: box ? 'summary' : 'free', role, align: box ? 'left' : 'center', box: !!box, x: 0, y: 0, w: 0, h: 0 }, S().width, S().height, box ? '요약 한 줄\n요약 두 줄' : '글을 입력하세요', S(), measure);
    Object.assign(t, { x: Math.round(Math.max(0, Math.min(W - w, pt.x - w / 2))), y: Math.round(Math.max(0, Math.min(S().height - h, pt.y - h / 2))), w: Math.round(w), h: Math.round(h) });
    fitText(t);
    PG().texts.push(t);
    app.selected = { kind: 'item', id: t.id };
    drawCurrent(); afterChange(); startInlineEdit(t.id);
    return;
  }
  drawCurrent(); afterChange();
  if (msg) toast(msg);
}

function applyByClick(kind, value) {
  const s = app.selected;
  let panel = null, hit = null;
  if (s && s.kind === 'item') { hit = itemOf(s.id); panel = panelOf(s.id); }
  else if (s && s.kind === 'panel') panel = PG().panels.find((p) => p.id === s.id);
  if (kind === 'text') { applyMaterial({ kind, value }, null, { x: S().width / 2, y: S().height / 2 }, null); return; }
  if (!panel && !(hit && hit.type === 'text' && kind === 'font')) { toast('먼저 캔버스에서 컷이나 인물을 선택하거나, 재료를 컷으로 끌어다 놓으세요.'); return; }
  if (kind === 'character' || (kind === 'bubble' && hit && hit.type !== 'bubble')) hit = kind === 'bubble' ? hit : null;
  const pt = hit && panel ? { x: hit.x + (hit.w ? hit.w / 2 : 0), y: hit.y - (hit.size ? hit.size * 0.7 : 0) } : panel ? { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 } : { x: 0, y: 0 };
  applyMaterial({ kind, value }, panel, pt, hit);
}

// ── 레이어 패널 ──────────────────────────────────────────────────────
function renderLayers() {
  const el = $('#layers');
  if (!app.ep || app.ui.layersClosed) { el.innerHTML = ''; return; }
  const pg = PG();
  const on = (id) => (app.selected && app.selected.id === id ? 'on' : '');
  const rows = [];
  for (const t of pg.texts) rows.push(`<div class="layer ${on(t.id)}" data-layer="${t.id}" role="button" tabindex="0"><span class="sw">글</span><span class="nm">${esc(t.text.split('\n')[0] || '(빈 글)')}</span><button class="del" data-ldel="${t.id}" aria-label="삭제">✕</button></div>`);
  pg.panels.forEach((p, i) => {
    rows.push(`<div class="layer ${on(p.id)}" data-lpanel="${p.id}" role="button" tabindex="0"><span class="sw">${i + 1}컷</span><span class="nm">${esc(p.bgImage ? '배경 이미지' : (BACKGROUNDS.find((b) => b.id === p.background.kind)?.label || ''))}${p.zoom ? ` · 배율 ${p.zoom.toFixed(1)}×` : ''}</span></div>`);
    for (const it of p.items) {
      const label = it.type === 'character' ? `${charOf(it)?.name || '인물'} · ${EMOTIONS.find((e) => e.id === it.emotion)?.label || ''}` : it.type === 'sticker' ? `${it.name || '캐릭터'} (그림 레이어)` : it.type === 'region' ? `영역 · ${it.name || ''}` : it.text;
      rows.push(`<div class="layer sub ${on(it.id)}" data-layer="${it.id}" role="button" tabindex="0"><span class="sw">${it.type === 'character' || it.type === 'sticker' ? '인물' : it.type === 'region' ? '영역' : '말'}</span><span class="nm">${esc(label)}</span><button class="del" data-ldel="${it.id}" aria-label="삭제">✕</button></div>`);
    }
  });
  rows.push('<div class="layer" style="opacity:.7"><span class="sw">🔒</span><span class="nm">워터마크·페이지 번호 (설정에서 위치 고정)</span></div>');
  el.innerHTML = `<h2>레이어<small>${app.page + 1} 페이지 · ${pageKindLabel(pg.kind)}</small></h2>${rows.join('')}`;
}
function bindLayers() {
  $('#layers').addEventListener('click', (e) => {
    const d = e.target.closest('[data-ldel]');
    if (d) { snapshot(); deleteItem(d.dataset.ldel); drawCurrent(); afterChange(); return; }
    const l = e.target.closest('[data-layer]');
    if (l) { app.selected = { kind: 'item', id: l.dataset.layer }; drawCurrent(); return; }
    const p = e.target.closest('[data-lpanel]');
    if (p) { app.selected = { kind: 'panel', id: p.dataset.lpanel }; drawCurrent(); }
  });
}

// ── 왼쪽 패널 ────────────────────────────────────────────────────────
function iconSVG(inner, vb = '-70 -215 140 225') { return `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`; }
function bubbleIcon(kind) {
  const ink = '#1b1f2a';
  switch (kind) {
    case 'thought': return iconSVG(`<g fill="#fff" stroke="${ink}" stroke-width="2"><circle cx="9" cy="12" r="6"/><circle cx="18" cy="9" r="7"/><circle cx="23" cy="15" r="5"/><circle cx="13" cy="17" r="5"/><circle cx="6" cy="25" r="2"/></g>`, '0 0 30 30');
    case 'shout': return iconSVG(`<polygon points="15,2 18,9 27,6 22,13 29,17 21,18 23,27 16,21 9,28 10,19 2,17 9,13 4,5 12,9" fill="#fff" stroke="${ink}" stroke-width="2"/>`, '0 0 30 30');
    case 'whisper': return iconSVG(`<ellipse cx="15" cy="12" rx="12" ry="8" fill="#fff" stroke="${ink}" stroke-width="2" stroke-dasharray="3 2"/><path d="M10 19 L7 27 L15 20" fill="#fff" stroke="${ink}" stroke-width="2" stroke-dasharray="3 2"/>`, '0 0 30 30');
    case 'narration': return iconSVG(`<rect x="3" y="7" width="24" height="15" fill="#fffbe6" stroke="${ink}" stroke-width="2"/>`, '0 0 30 30');
    default: return iconSVG(`<path d="M10 19 L7 27 L16 20" fill="#fff" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="15" cy="12" rx="12" ry="8" fill="#fff" stroke="${ink}" stroke-width="2"/><path d="M11 19 L16 19" stroke="#fff" stroke-width="3"/>`, '0 0 30 30');
  }
}
const chip = (kind, value, label, icon = '') => `<span class="chip" draggable="true" tabindex="0" role="button" data-kind="${kind}" data-value="${esc(value)}">${icon}${esc(label)}</span>`;
function charIcon(c) {
  const e = (c.images || [])[0];
  const a = e && app.assets[e.assetId];
  return a ? `<img src="${safeImageUrl(a.url)}" alt="">` : `<span class="dot" style="background:${c.color}"></span>`;
}

function renderSide() {
  const el = $('#side');
  const t = app.ui.tab;
  const f = { imgedit: sideImageEdit, script: sideScript, layout: sideLayout, elements: sideElements, text: sideText, upload: sideUpload, background: sideBackground, guide: sideGuide, ai: sideAi, settings: sideSettings }[t] || sideElements;
  el.innerHTML = f();
  if (t === 'script') renderScriptPreview();
}

function sideScript() {
  return `<h2>장면 스크립트</h2>
    <label class="sr-only" for="script-text">장면 스크립트</label>
    <textarea id="script-text" spellcheck="false">${esc(app.ep.script)}</textarea>
    <div id="script-preview" class="preview-box"></div>
    <button class="btn accent wide" data-side="generate">배치 가이드 만들기</button>
    <p class="hint" style="margin-top:6px">지금 페이지 배치는 새 가이드로 바뀝니다(되돌리기 가능). 캐릭터와 등록한 이미지는 그대로 둡니다.</p>
    <details style="margin-top:12px"><summary>쓰는 법</summary><dl class="syntax">
      <dt>제목: … / 회차: 3화 / 부제: …</dt><dd>표지 페이지에 들어갑니다.</dd>
      <dt>#1 카페, 아침</dt><dd>새 장면(컷). 장소 낱말로 배경 가이드를 고르고 '밤'이면 어둡게.</dd>
      <dt>민지(기쁨): 대사</dt><dd>인물·감정·대사. 처음 나온 이름은 캐릭터로 추가됩니다.</dd>
      <dt>준호(속마음): …</dt><dd>생각 풍선. (외침)·'!!'는 외침, (속삭임)은 점선 풍선.</dd>
      <dt>(민지가 손을 흔든다)</dt><dd>지문에서 동작·감정을 찾아 적용합니다.</dd>
      <dt>내레이션: 그날 오후</dt><dd>컷 왼쪽 위 네모 상자.</dd>
      <dt>[마지막] 다음 줄들, 요약: …</dt><dd>마지막(요약) 페이지의 요약 목록. 마무리: …는 마지막 페이지 인물의 말풍선.</dd>
    </dl></details>`;
}
function renderScriptPreview() {
  const box = $('#script-preview');
  if (!box) return;
  const parsed = parseScript(app.ep.script);
  if (parsed.pages && parsed.pages.length) {
    const lineCount = (sc) => sc.lines.length;
    box.innerHTML = `<b>${parsed.pages.length}페이지</b> 예정 (대본의 페이지 구분을 그대로 따름)<br>인물 ${parsed.characters.length}명${parsed.characters.length ? ` (${parsed.characters.map(esc).join(', ')})` : ''}
      <ol>${parsed.pages.map((pg) => `<li>${esc(pg.title || '')} — ${pageKindLabel(pg.kind)}${pg.kind === 'content' ? `, ${pg.scenes.length}컷 · 글 ${pg.scenes.reduce((a, sc) => a + lineCount(sc), 0)}개${pg.scenes.some((sc) => sc.zoom > 1) ? ' · 클로즈업' : ''}` : ''}</li>`).join('')}</ol>
      ${parsed.summary.length ? `요약 ${parsed.summary.filter((l) => /^\d+[.)]/.test(l)).length || parsed.summary.length}항목` : ''}
      ${parsed.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}`;
    return;
  }
  const per = perPage(S(), findTemplate(S().pageTemplates.content, app.templates));
  const nContent = Math.max(1, Math.ceil(parsed.scenes.length / per));
  const total = (parsed.title ? 1 : 0) + nContent + (parsed.summary.length || parsed.closing ? 1 : 0);
  box.innerHTML = `<b>${total}페이지</b> 예정: ${parsed.title ? '표지 1 + ' : ''}내용 ${nContent}(장면 ${parsed.scenes.length}개, 페이지당 ${per}컷)${parsed.summary.length || parsed.closing ? ' + 마지막 1' : ''}<br>인물 ${parsed.characters.length}명${parsed.characters.length ? ` (${parsed.characters.map(esc).join(', ')})` : ''}${parsed.summary.length ? `<br>요약 ${parsed.summary.length}줄` : ''}
    ${parsed.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}`;
}

function sideLayout() {
  const pg = PG();
  const s = S();
  const tpls = allTemplates(app.templates).filter((t) => t.kind === pg.kind);
  const presets = pg.kind === 'content' ? LAYOUTS.filter((l) => l.rows).map((l) => `<button class="tpl" data-preset="${l.id}">${tplThumb({ panels: computePanels(s, l.id, false).map((r) => ({ x: r.x / s.width, y: r.y / s.height, w: r.w / s.width, h: r.h / s.height })) }, s)}${l.label}</button>`).join('') : '';
  return `<h2>레이아웃</h2>
    <p class="hint">${app.page + 1} 페이지에 적용합니다. 인물과 말풍선은 같은 순서의 컷으로 옮겨집니다.</p>
    <div class="kv"><label for="pg-kind">페이지 종류</label><select id="pg-kind" data-side="kind">${opt(PAGE_KINDS, pg.kind)}</select><span></span></div>
    <h3>${pageKindLabel(pg.kind)} 레이아웃</h3>
    <div class="tpl-list">${tpls.map((t) => `<button class="tpl ${pg.templateId === t.id ? 'on' : ''}" data-tpl="${t.id}">${tplThumb(t, s)}${esc(t.name)}${t.builtin ? '' : `<span class="x" data-del-tpl="${t.id}" role="button" aria-label="${esc(t.name)} 삭제">✕</span>`}</button>`).join('')}</div>
    ${presets ? `<h3>컷 나누기</h3><div class="tpl-list">${presets}</div>` : ''}
    <div class="group"><h3>반복해서 쓰는 레이아웃</h3>
    <p class="hint">표지·내용·마지막 페이지를 매 회차 같은 모양으로 쓰려면, 페이지를 다듬은 뒤 레이아웃으로 등록하고 설정에서 기본값으로 고르세요.</p>
    <button class="btn line wide" data-side="register" style="margin-top:8px">이 페이지를 레이아웃으로 등록</button></div>`;
}

function sideElements() {
  const chars = P().characters;
  return `<h2>요소</h2>
    <h3>캐릭터</h3>
    <div class="chips">${chars.map((c) => `<span class="chip" draggable="true" tabindex="0" role="button" data-kind="character" data-value="${c.id}">${charIcon(c)}${esc(c.name)}<button class="x" data-del-char="${c.id}" aria-label="${esc(c.name)} 삭제">×</button></span>`).join('') || '<span class="hint">스크립트에 이름을 쓰거나 아래에서 추가하세요.</span>'}</div>
    <form id="form-add-char" class="row" style="margin-top:8px">
      <label class="sr-only" for="new-char-name">새 캐릭터 이름</label><input id="new-char-name" placeholder="새 캐릭터 이름" maxlength="12" required style="flex:1">
      <label class="sr-only" for="new-char-color">색</label><input id="new-char-color" type="color" value="${CHARACTER_COLORS[chars.length % CHARACTER_COLORS.length]}">
      <button class="btn dark sm" type="submit">추가</button>
    </form>
    <p class="hint" style="margin-top:6px">캐릭터 이미지는 업로드 탭에서 등록합니다. 등록하면 가이드 그림 대신 그 이미지가 쓰입니다.</p>
    <h3>감정</h3><div class="chips">${EMOTIONS.map((e) => chip('emotion', e.id, e.label, iconSVG(`<circle cx="15" cy="15" r="13" fill="#fff6ee" stroke="#1b1f2a" stroke-width="1.6"/>${face(15, 15, 12, e.id)}`, '0 0 30 30'))).join('')}</div>
    <h3>동작 <span class="muted">가이드 그림 인물용</span></h3><div class="chips">${ACTIONS.map((a) => chip('action', a.id, a.label, iconSVG(figure('stick', 'neutral', a.id, '#5f6b7d')))).join('')}</div>
    <h3>말풍선</h3><div class="chips">${BUBBLES.map((b) => chip('bubble', b.id, b.label, bubbleIcon(b.id))).join('')}</div>
    <p class="hint" style="margin-top:12px">끌어서 컷에 놓으면 바닥선·빈자리에 맞춰 놓입니다. 감정은 인물 위에 놓으세요. 칩을 클릭하면 선택한 컷이나 인물에 적용됩니다.</p>`;
}

function fontRowsHTML() {
  return FONT_ROLES.map((r) => {
    const f = S().fonts[r.id];
    const sample = r.id === 'title' ? '커피 한 잔의 비밀' : r.id === 'dialogue' ? '오늘 커피는 내가 살게!' : '뭔가 수상한데…';
    return `<div class="font-row" data-role="${r.id}"><span class="role">${r.label}</span>
      <label class="sr-only" for="ff-${r.id}">${r.label} 글꼴</label><select id="ff-${r.id}" data-fk="family">${FONTS.map((n) => `<option ${n === f.family ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label class="sr-only" for="fs-${r.id}">${r.label} 크기</label><input id="fs-${r.id}" data-fk="size" type="number" min="12" max="140" value="${f.size}">
      <div class="sample" style="font-family:'${f.family}'">${sample}</div></div>`;
  }).join('');
}
function sideText() {
  return `<h2>텍스트</h2>
    <h3>글 상자 추가</h3>
    <div class="chips">${chip('text', 'title', '제목 글')}${chip('text', 'dialogue', '본문 글')}${chip('text', 'monologue', '독백 글')}${chip('text', 'dialogue|box', '요약 상자')}</div>
    <h3>폰트 (제목·대화·독백)</h3>
    <div id="font-rows">${fontRowsHTML()}</div>
    <h3>폰트 입히기</h3>
    <div class="chips">${FONT_ROLES.map((r) => chip('font', r.id, `${r.label} 글꼴`)).join('')}</div>
    <p class="hint" style="margin-top:6px">말풍선이나 글 상자 위에 놓으면 그 글꼴로 바뀝니다.</p>`;
}

function sideUpload() {
  const assets = Object.values(app.assets);
  const chars = P().characters;
  return `<h2>업로드</h2>
    <div class="drop-zone" id="drop-zone"><span>캐릭터·배경 이미지를 여기로 끌어 오거나</span><div class="row" style="justify-content:center"><button class="btn dark sm" data-side="pick">내 컴퓨터에서 고르기</button><button class="btn dark sm" data-side="pick-drive">Google 드라이브에서 고르기</button></div><span class="muted">PNG(투명 배경)를 권장합니다. 긴 변 2000px 넘으면 줄여서 저장합니다.</span></div>
    <h3>업로드한 이미지 <span class="muted">${assets.length}개</span></h3>
    ${assets.length ? `<div class="tiles">${assets.map((a) => `<button class="tile" draggable="true" data-kind="bgasset" data-value="${a.id}" data-asset="${a.id}" title="클릭: 쓰임 정하기 · 끌기: 컷 배경으로"><img src="${safeImageUrl(a.url)}" alt="${esc(a.name)}"><span class="x" data-del-asset="${a.id}" role="button" aria-label="삭제">✕</span></button>`).join('')}</div><p class="hint" style="margin-top:6px">이미지를 클릭하면 캐릭터 이미지로 등록하거나 워터마크로 쓸 수 있습니다. 컷으로 끌면 컷 배경이 됩니다.</p>` : '<p class="hint">아직 없습니다.</p>'}
    <div class="group"><h3>캐릭터별 이미지</h3>
    ${chars.map((c) => `<div style="margin-bottom:10px"><div class="row" style="margin-bottom:6px"><span class="chip" style="cursor:default"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="muted">${(c.images || []).length}개</span></div>
      ${(c.images || []).length ? `<div class="tiles">${c.images.map((v) => { const a = app.assets[v.assetId]; return a ? `<button class="tile" draggable="true" data-kind="variant" data-value="${c.id}|${v.id}" title="끌어서 컷에 놓기">${iconSVG(drawImageFigure({ x: 4, y: 4, w: 92, h: 92 }, v, a, false), '0 0 100 100')}<span class="tag">${esc(v.label || EMOTIONS.find((e) => e.id === v.emotion)?.label || '')}</span><span class="x" data-del-variant="${c.id}|${v.id}" role="button" aria-label="삭제">✕</span></button>` : ''; }).join('')}</div>` : '<p class="hint">업로드한 이미지를 클릭해 등록하세요.</p>'}</div>`).join('')}</div>`;
}

function sideBackground() {
  const assets = Object.values(app.assets);
  return `<h2>배경</h2>
    <h3>배경 가이드 (선 그림)</h3>
    <div class="chips">${BACKGROUNDS.map((b) => chip('background', b.id, b.label)).join('')}</div>
    <h3>배경 이미지</h3>
    ${assets.length ? `<div class="tiles">${assets.map((a) => `<button class="tile" draggable="true" data-kind="bgasset" data-value="${a.id}" title="컷으로 끌어 놓기"><img src="${safeImageUrl(a.url)}" alt="${esc(a.name)}"></button>`).join('')}</div>` : '<p class="hint">업로드 탭에서 배경 이미지를 올리면 여기에 나옵니다.</p>'}
    <p class="hint" style="margin-top:8px">컷으로 끌어 놓으면 컷을 꽉 채우도록 맞춰 보이고, 원본 이미지는 바뀌지 않습니다.</p>`;
}

// ── 대사 가이드 ──────────────────────────────────────────────────────
function diffHTML(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const mid = (s) => s.slice(i, s.length - j);
  return `${esc(a.slice(0, i))}${mid(a) ? `<del>${esc(mid(a))}</del>` : ''}${mid(b) ? `<ins>${esc(mid(b))}</ins>` : ''}${esc(a.slice(a.length - j))}`;
}
function issuesHTML(b) {
  const res = checkLine(b.text);
  const parts = [];
  const fixes = res.issues.filter((x) => x.kind === 'spelling');
  if (fixes.length) {
    const lvl = fixes.every((x) => x.level === 'hint') ? 'hint' : 'fix';
    parts.push(`<div class="issue ${lvl}"><div class="row"><span class="tag">${lvl === 'fix' ? '맞춤법' : '맞춤법 · 뜻 확인'}</span><button class="btn dark sm" data-apply="${b.id}" data-text="${esc(res.suggestion)}">적용</button></div>
      <div class="sugg">${diffHTML(b.text, res.suggestion)}</div>${fixes.map((x) => `<div class="why">${esc(x.from)} → ${esc(x.to)}: ${esc(x.why)}</div>`).join('')}</div>`);
  }
  for (const f of res.issues.filter((x) => x.kind === 'fact')) parts.push(`<div class="issue fact"><span class="tag">사실 확인 필요</span><div class="why">${esc(f.why)}</div></div>`);
  const ai = app.ai[b.id];
  if (ai && ai.text === b.text) {
    const r = ai.result;
    const verdict = { ok: '사실과 맞음', doubtful: '의심스러움', false: '사실과 다름', unverifiable: '판단 근거 부족' }[r.factVerdict];
    const changed = r.suggestion && r.suggestion !== b.text;
    if (changed || verdict) parts.push(`<div class="issue ai"><div class="row"><span class="tag">Claude 의견${verdict ? ` · ${verdict}` : ''}</span>${changed ? `<button class="btn dark sm" data-apply="${b.id}" data-text="${esc(r.suggestion)}">적용</button>` : ''}</div>${changed ? `<div class="sugg">${diffHTML(b.text, r.suggestion)}</div>` : ''}${r.spellingNote ? `<div class="why">${esc(r.spellingNote)}</div>` : ''}${r.factNote ? `<div class="why">${esc(r.factNote)}</div>` : ''}</div>`);
  }
  return { html: parts.join(''), nFix: fixes.length ? 1 : 0, nFact: res.issues.some((x) => x.kind === 'fact') ? 1 : 0 };
}
function allLines() {
  const out = [];
  P().pages.forEach((pg, pi) => {
    pg.texts.forEach((t) => out.push({ pi, item: t, where: '글 상자' }));
    pg.panels.forEach((pn, ci) => pn.items.forEach((b) => { if (b.type === 'bubble') out.push({ pi, item: b, where: `${ci + 1}컷`, panel: pn }); }));
  });
  return out;
}
function findItemAnywhere(id) {
  for (let pi = 0; pi < P().pages.length; pi++) {
    const pg = P().pages[pi];
    const t = pg.texts.find((x) => x.id === id);
    if (t) return { pi, item: t, panel: null };
    for (const pn of pg.panels) { const b = pn.items.find((x) => x.id === id); if (b) return { pi, item: b, panel: pn }; }
  }
  return null;
}
function sideGuide() {
  let nFix = 0, nFact = 0;
  const lines = allLines();
  const byPage = new Map();
  for (const l of lines) {
    const iss = issuesHTML(l.item);
    nFix += iss.nFix; nFact += iss.nFact;
    const sp = l.item.tailTo ? l.panel?.items.find((o) => o.id === l.item.tailTo) : null;
    const ch = sp ? P().characters.find((c) => c.id === sp.charId) : null;
    const who = l.item.type === 'text' ? '글 상자' : `${ch ? `<span class="dot" style="background:${ch.color}"></span>${esc(ch.name)}` : '—'} · ${BUBBLES.find((x) => x.id === l.item.kind)?.label}`;
    const html = `<div class="g-line ${app.selected?.id === l.item.id ? 'selected' : ''}" data-line="${l.item.id}"><div class="who">${l.where} · ${who}</div>
      <label class="sr-only" for="ta-${l.item.id}">대사</label><textarea id="ta-${l.item.id}" data-edit="${l.item.id}" rows="2">${esc(l.item.text)}</textarea><div class="issues">${iss.html}</div></div>`;
    if (!byPage.has(l.pi)) byPage.set(l.pi, []);
    byPage.get(l.pi).push(html);
  }
  return `<h2>대사 가이드</h2>
    <div class="row"><button class="btn dark sm" data-side="check">맞춤법·사실 검사</button><button class="btn line sm" data-side="ai-check">Claude로 검사</button></div>
    <div class="guide-summary"><span>글 <b>${lines.length}</b>줄</span><span class="n-fix">맞춤법 고칠 곳 <b>${nFix}</b></span><span class="n-warn">사실 확인 <b>${nFact}</b></span></div>
    ${!app.apiKey ? '<p class="hint">Claude 검사는 설정 탭의 "AI 연결"에 API 키를 넣으면 쓸 수 있습니다.</p>' : ''}
    ${[...byPage.entries()].map(([pi, rows]) => `<div class="g-page"><h4>${pi + 1} 페이지 · ${pageKindLabel(P().pages[pi].kind)}</h4>${rows.join('')}</div>`).join('') || '<p class="hint">대사가 아직 없습니다.</p>'}`;
}
function highlightGuide(id) {
  if (app.ui.tab !== 'guide') return;
  $$('.g-line.selected').forEach((el) => el.classList.remove('selected'));
  const el = $(`.g-line[data-line="${id}"]`);
  if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
function updateLineItem(found, text) {
  found.item.text = text;
  if (found.item.type === 'bubble') {
    const keep = app.page;
    app.page = found.pi; resizeBubble(found.item, found.panel); app.page = keep;
  } else fitText(found.item);
}

// ── AI 활용 ──────────────────────────────────────────────────────────
function charsUsingAsset(assetId) { return P().characters.filter((c) => (c.images || []).some((v) => v.assetId === assetId)); }
function sideAi() {
  const assets = Object.values(app.assets);
  if (!assets.length) return '<h2>AI 활용</h2><p class="hint">업로드 탭에서 캐릭터 이미지를 올리면, 캐릭터를 바꾸지 않는 범위에서 활용 방법(자르기, 반전, 스티커, 배경 판, 색 조합, 배치 팁)을 제안합니다.</p>';
  const pick = app.aiPick && app.assets[app.aiPick] ? app.aiPick : (charsUsingAsset(assets[0].id).length ? assets[0].id : assets[0].id);
  app.aiPick = pick;
  const a = app.assets[pick];
  const g = a.guide;
  const owners = charsUsingAsset(pick);
  const ownerId = app.aiOwner && P().characters.some((c) => c.id === app.aiOwner) ? app.aiOwner : owners[0]?.id || P().characters[0]?.id || '';
  app.aiOwner = ownerId;
  const selChar = app.selected?.kind === 'item' && itemOf(app.selected.id)?.type === 'character' ? itemOf(app.selected.id) : null;
  return `<h2>AI 활용 가이드</h2>
    <div class="tiles" style="grid-template-columns:repeat(5,1fr)">${assets.map((x) => `<button class="tile" data-ai-pick="${x.id}" style="${x.id === pick ? 'outline:2px solid var(--accent)' : ''}" aria-label="${esc(x.name)} 고르기"><img src="${safeImageUrl(x.url)}" alt=""></button>`).join('')}</div>
    <div class="kv" style="margin-top:10px"><label for="ai-owner">캐릭터</label><select id="ai-owner" data-side="ai-owner">${opt(P().characters.map((c) => ({ id: c.id, label: c.name })), ownerId)}</select><span></span></div>
    <div class="row"><button class="btn accent sm" data-side="ai-run">Claude로 분석</button><button class="btn line sm" data-side="ai-basic">기본 제안 (AI 없이)</button></div>
    ${!app.apiKey ? '<p class="hint" style="margin-top:6px">Claude 분석은 설정 탭 "AI 연결"에 API 키가 필요합니다. 기본 제안은 이미지에서 색만 뽑고 정해진 활용법을 붙입니다.</p>' : ''}
    ${g ? `<div class="group">
      <h3>${g.source === 'claude' ? 'Claude 분석' : '기본 제안'}</h3>
      <p class="hint" style="color:var(--fg)">${esc(g.summary)}</p>
      ${g.keep.length ? `<h3>꼭 지킬 것</h3><ul class="plain">${g.keep.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
      ${g.avoid.length ? `<h3>하지 말 것</h3><ul class="plain">${g.avoid.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
      ${g.palette.length ? `<h3>색 조합 <span class="muted">클릭하면 복사</span></h3><div class="palette">${g.palette.map((p) => `<button class="swatch" data-copy="${p.hex}" title="${esc(p.use)}"><i style="background:${p.hex}"></i>${esc(p.name)}</button>`).join('')}</div>` : ''}
      <h3>활용 제안</h3>
      ${g.usages.map((u, i) => {
        const v = { assetId: pick, transform: u.transform, faceBox: g.faceBox };
        const t = u.transform;
        const tags = [{ full: '전신', bust: '상반신', face: '얼굴' }[t.crop], t.flip && '반전', t.rotate && `${Math.round(t.rotate)}° 기울임`, t.outline && '흰 외곽선', t.shadow && '그림자', t.plate !== 'none' && (t.plate === 'circle' ? '원형 판' : '둥근 판'), EMOTIONS.find((e) => e.id === u.emotion)?.label].filter(Boolean);
        return `<div class="usage">${iconSVG(drawImageFigure({ x: 8, y: 8, w: 84, h: 84 }, v, a, false), '0 0 100 100')}<div><b>${esc(u.title)}</b><p>${esc(u.when)}</p><div class="tags">${tags.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
          <div class="row"><button class="btn dark sm" data-use="${i}">캐릭터 이미지로 추가</button>${selChar ? `<button class="btn line sm" data-use-sel="${i}">선택한 인물에 적용</button>` : ''}</div></div></div>`;
      }).join('')}
      ${g.tips.length ? `<h3>배치 팁</h3><ul class="plain">${g.tips.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
    </div>` : '<p class="hint" style="margin-top:10px">이미지를 고르고 분석을 눌러 주세요.</p>'}`;
}
function addVariant(charId, assetId, usage, faceBox) {
  const ch = P().characters.find((c) => c.id === charId);
  if (!ch) { toast('먼저 캐릭터를 고르세요.'); return null; }
  ch.images = ch.images || [];
  const v = { id: uid('v'), assetId, emotion: usage ? usage.emotion : 'neutral', transform: usage ? usage.transform : { crop: 'full' }, faceBox, label: usage ? usage.title : '' };
  ch.images.push(v);
  for (const e of ch.images) if (e.assetId === assetId && faceBox) e.faceBox = faceBox;
  return v;
}

// ── 설정 ─────────────────────────────────────────────────────────────
function anchorGrid(name, cur) {
  return `<div class="anchor-grid" role="group" aria-label="위치">${ANCHORS.map((a) => `<button data-anchor="${name}" data-v="${a}" aria-pressed="${a === cur}" title="${ANCHOR_LABEL[a]}" aria-label="${ANCHOR_LABEL[a]}"></button>`).join('')}</div>`;
}
function slider(id, label, val, min, max, step = 1, unit = 'px') {
  return `<div class="kv"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-set="${id}"><output id="out-${id}">${unit === '%' ? Math.round(val * 100) : val}${unit}</output></div>`;
}
function markPreview() {
  const s = S();
  const W = s.width, H = s.height;
  // 작은 미리보기에서도 보이게 글자를 키우고 색을 진하게 한다(위치 계산은 같음)
  const big = (m, color) => ({ ...m, skipCover: false, size: m.size * 3, opacity: 1, color });
  return `<svg viewBox="0 0 ${W} ${H}" aria-label="워터마크와 페이지 번호 위치 미리보기"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${s.margin}" y="${s.margin}" width="${W - s.margin * 2}" height="${H - s.margin * 2}" fill="#eef1f5"/>${drawMarks({ ...s, pageNumber: big(s.pageNumber, '#0b7285'), watermark: big(s.watermark, '#e8590c') }, app.assets, 1, 5, 'content')}</svg>`;
}
function textureSample(id) {
  const s = { ...S(), texture: id };
  return `<svg viewBox="-80 -215 160 225" aria-hidden="true"><defs>${textureDefs(id)}</defs><g${textureFilterAttr(id)}><rect x="-80" y="-20" width="160" height="30" fill="#c5e3c0"/>${figure(s.style, 'happy', 'wave', '#e8590c')}</g></svg>`;
}
function sideSettings() {
  const s = S();
  const wm = s.watermark, pn = s.pageNumber;
  const tplSel = (kind) => `<select data-ptpl="${kind}" aria-label="${pageKindLabel(kind)} 레이아웃">${opt(allTemplates(app.templates).filter((t) => t.kind === kind).map((t) => ({ id: t.id, label: t.name })), s.pageTemplates[kind])}</select>`;
  const assets = Object.values(app.assets);
  return `<h2>설정</h2>
    <p class="hint">이 회차에 적용됩니다. 새 회차에도 쓰려면 맨 아래 "기본값으로 저장"을 누르세요.</p>
    <div class="group"><h3>질감 표현</h3>
    <div class="choices">${TEXTURES.map((t) => `<button class="choice" data-texture="${t.id}" aria-pressed="${s.texture === t.id}">${textureSample(t.id)}${t.label}<small>${t.note}</small></button>`).join('')}</div>
    <p class="hint" style="margin-top:6px">배경·인물·업로드 이미지에 입히고 글자에는 입히지 않습니다. 내보낸 PNG에도 같이 들어갑니다.</p>
    <h3>컷 테두리 선</h3>
    <div class="choices">${TEXTURES.map((t) => `<button class="choice" data-btex="${t.id}" aria-pressed="${(s.border.texture) === t.id}"><svg viewBox="0 0 100 64" aria-hidden="true"><defs>${filterDef(t.id)}</defs><rect x="10" y="10" width="80" height="44" fill="none" stroke="${esc(s.border.color)}" stroke-width="${Math.max(2, s.border.width)}"${textureFilterAttr(t.id)}/></svg>${t.label}</button>`).join('')}</div>
    ${slider('bw', '선 굵기', s.border.width, 1, 16)}
    <div class="kv"><label for="border-color">선 색</label><input id="border-color" type="color" data-border="color" value="${esc(s.border.color)}"><span></span></div>
    <p class="hint">그림 질감과 따로 고를 수 있습니다. 예) 그림은 수채화, 테두리는 펜.</p>
    <h3>가이드 인물 모양</h3>
    <div class="choices">${STYLES.map((st) => `<button class="choice" data-style="${st.id}" aria-pressed="${s.style === st.id}">${st.label}</button>`).join('')}</div></div>
    <div class="group"><h3>캔버스 크기</h3>
    <div class="chips">${SIZES.map((z) => `<button class="choice" data-size="${z.id}" aria-pressed="${s.sizeId === z.id}" style="justify-items:start">${z.label}<small>${z.id === 'custom' ? '직접 입력' : `${z.w}×${z.h}`}</small></button>`).join('')}</div>
    <div class="kv"><label for="set-w">가로·세로</label><div class="row" style="flex-wrap:nowrap"><input id="set-w" type="number" min="400" max="4000" step="10" value="${s.width}" data-num="width"><input id="set-h" type="number" min="400" max="6000" step="10" value="${s.height}" data-num="height" aria-label="세로"></div><span></span></div>
    </div>
    <div class="group"><h3>내용 페이지 컷</h3>
    <div class="choices">${LAYOUTS.map((l) => `<button class="choice" data-layout="${l.id}" aria-pressed="${s.layout === l.id}">${l.rows ? tplThumb({ panels: computePanels({ ...s, showTitle: false }, l.id, false).map((r) => ({ x: r.x / s.width, y: r.y / s.height, w: r.w / s.width, h: r.h / s.height })) }, s) : '<span class="lt" style="font-size:20px;padding:12px 0">자동</span>'}${l.label}</button>`).join('')}</div>
    ${s.layout === 'auto' ? slider('per', '페이지당 컷', s.panelsPerPage, 1, 9, 1, '컷') : ''}
    ${slider('margin', '바깥 여백', s.margin, 0, 120, 2)}
    ${slider('gutter', '컷 간격', s.gutter, 0, 80, 2)}
    <p class="hint">크기·컷·여백은 "배치 가이드 다시 만들기"를 하거나 레이아웃 탭에서 다시 적용하면 반영됩니다.</p></div>
    <div class="group"><h3>폰트</h3><div id="font-rows">${fontRowsHTML()}</div></div>
    <div class="group"><h3>워터마크·페이지 번호 <span class="muted">모든 페이지 같은 자리</span></h3>
    <div class="mark-preview">${markPreview()}<div style="display:grid;gap:6px"><span class="muted">미리보기 (2 / 5 페이지)</span><span class="hint"><b style="color:#e8590c">주황</b> 워터마크, <b style="color:#3bc9db">청록</b> 페이지 번호. 위치 칸을 고른 뒤 슬라이더로 가장자리에서 떨어진 거리를 맞추세요.</span></div></div>
    <h3><label class="switch"><input type="checkbox" data-wm="enabled" ${wm.enabled ? 'checked' : ''}> 워터마크</label></h3>
    <div class="kv"><label>종류</label><select data-wm="type" aria-label="워터마크 종류"><option value="text" ${wm.type === 'text' ? 'selected' : ''}>글자</option><option value="image" ${wm.type === 'image' ? 'selected' : ''}>이미지(로고)</option></select><span></span></div>
    ${wm.type === 'image' ? `<div class="kv"><label>이미지</label><select data-wm="assetId" aria-label="워터마크 이미지"><option value="">고르세요</option>${assets.map((a) => `<option value="${a.id}" ${wm.assetId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select><span></span></div>` : `<div class="kv"><label for="wm-text">문구</label><input id="wm-text" data-wm="text" value="${esc(wm.text)}"><input type="color" data-wm="color" value="${esc(wm.color)}" aria-label="워터마크 색"></div>`}
    <div class="kv"><label>위치</label>${anchorGrid('wm', wm.anchor)}<span></span></div>
    ${slider('wm-dx', '가로 여백', wm.dx, 0, 300)}${slider('wm-dy', '세로 여백', wm.dy, 0, 300)}${slider('wm-size', '크기', wm.size, 10, 80)}${slider('wm-opacity', '투명도', wm.opacity, 0.1, 1, 0.05, '%')}
    <label class="switch"><input type="checkbox" data-wm="skipCover" ${wm.skipCover ? 'checked' : ''}> 표지에는 넣지 않기</label>
    <h3><label class="switch"><input type="checkbox" data-pn="enabled" ${pn.enabled ? 'checked' : ''}> 페이지 번호</label></h3>
    <div class="kv"><label>형식</label><select data-pn="format" aria-label="페이지 번호 형식">${opt(PAGE_NUMBER_FORMATS, pn.format)}</select><input type="color" data-pn="color" value="${esc(pn.color)}" aria-label="페이지 번호 색"></div>
    <div class="kv"><label>위치</label>${anchorGrid('pn', pn.anchor)}<span></span></div>
    ${slider('pn-dx', '가로 여백', pn.dx, 0, 300)}${slider('pn-dy', '세로 여백', pn.dy, 0, 300)}${slider('pn-size', '크기', pn.size, 10, 80)}${slider('pn-opacity', '투명도', pn.opacity, 0.1, 1, 0.05, '%')}
    <label class="switch"><input type="checkbox" data-pn="skipCover" ${pn.skipCover ? 'checked' : ''}> 표지에는 넣지 않기</label></div>
    <div class="group"><h3>페이지 레이아웃 기본값</h3>
    ${PAGE_KINDS.map((k) => `<div class="kv"><label>${k.label}</label>${tplSel(k.id)}<span></span></div>`).join('')}
    <p class="hint">레이아웃 탭이나 페이지 위 아이콘으로 지금 페이지를 등록하면 여기서 고를 수 있습니다. "배치 가이드 만들기" 때 이 레이아웃으로 페이지를 만듭니다.</p></div>
    <div class="group"><h3>AI 연결</h3>
    ${keysHTML()}
    <h3>그림 편집(OpenAI) 옵션</h3>${openaiSettingsHTML()}</div>
    <div class="group" style="display:grid;gap:8px">
      <button class="btn accent wide" data-side="save-defaults">이 설정을 기본값으로 저장</button>
      <button class="btn line wide" data-side="regen">배치 가이드 다시 만들기</button>
    </div>`;
}

function setSetting(path, value, { geometry = false, rerenderSide = true } = {}) {
  const s = S();
  const keys = path.split('.');
  let o = s;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
  if (geometry) app.geometryDirty = true;
  $('#btn-size').textContent = `${s.width}×${s.height} px`;
  if (rerenderSide) { const sc = $('#side').scrollTop; renderSide(); $('#side').scrollTop = sc; }
  save();
}

function bindSide() {
  const side = $('#side');
  side.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'script-text') { app.ep.script = t.value; renderScriptPreview(); save(); return; }
    if (t.dataset.set) {
      const map = { bw: 'border.width', per: 'panelsPerPage', margin: 'margin', gutter: 'gutter', 'wm-dx': 'watermark.dx', 'wm-dy': 'watermark.dy', 'wm-size': 'watermark.size', 'wm-opacity': 'watermark.opacity', 'pn-dx': 'pageNumber.dx', 'pn-dy': 'pageNumber.dy', 'pn-size': 'pageNumber.size', 'pn-opacity': 'pageNumber.opacity' };
      const key = map[t.dataset.set];
      const v = Number(t.value);
      setSetting(key, v, { geometry: ['margin', 'gutter', 'panelsPerPage'].includes(key), rerenderSide: false });
      const out = $(`#out-${t.dataset.set}`);
      if (out) out.textContent = key.endsWith('opacity') ? `${Math.round(v * 100)}%` : `${v}${key === 'panelsPerPage' ? '컷' : 'px'}`;
      if (key.startsWith('watermark') || key.startsWith('pageNumber')) { $('.mark-preview svg').outerHTML = markPreview(); redrawAllMarks(); }
      if (key === 'border.width') redrawAllMarks();
      return;
    }
    if (t.dataset.rgName) { const r = itemOf(t.dataset.rgName); if (r) { r.name = t.value; drawPage(app.page); save(); } return; }
    if (t.dataset.wm === 'text') { S().watermark.text = t.value; $('.mark-preview svg').outerHTML = markPreview(); redrawAllMarks(); save(); return; }
    if (t.dataset.edit) {
      const found = findItemAnywhere(t.dataset.edit);
      if (!found) return;
      clearTimeout(app.typing);
      const val = t.value;
      app.typing = setTimeout(() => { updateLineItem(found, val); drawPage(found.pi); if (found.pi === app.page) renderToolbar(); const c = $(`.g-line[data-line="${found.item.id}"] .issues`); if (c) c.innerHTML = issuesHTML(found.item).html; save(); }, 200);
    }
  });
  side.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.num) {
      const lim = t.dataset.num === 'width' ? [400, 4000] : [400, 6000];
      const v = Math.max(lim[0], Math.min(lim[1], Number(t.value) || lim[0]));
      setSetting(t.dataset.num, v, { geometry: true });
      S().sizeId = SIZES.find((z) => z.w === S().width && z.h === S().height)?.id || 'custom';
      return;
    }
    if (t.dataset.wm && t.dataset.wm !== 'text') { setSetting(`watermark.${t.dataset.wm}`, t.type === 'checkbox' ? t.checked : t.value); redrawAllMarks(); return; }
    if (t.dataset.pn) { setSetting(`pageNumber.${t.dataset.pn}`, t.type === 'checkbox' ? t.checked : t.value); redrawAllMarks(); return; }
    if (t.dataset.border) { setSetting('border.color', t.value); redrawAllMarks(); return; }
    if (t.dataset.ptpl) { setSetting(`pageTemplates.${t.dataset.ptpl}`, t.value); return; }
    if (t.id === 'api-key') { app.apiKey = t.value.trim(); saveKey(); return; }
    if (t.id === 'oa-key') { app.openaiKey = t.value.trim(); saveOpenai(); renderSide(); toast(app.openaiKey ? 'OpenAI 키를 저장했습니다.' : 'OpenAI 키를 지웠습니다.'); return; }
    if (t.dataset.oa) { app.openai[t.dataset.oa] = t.type === 'checkbox' ? t.checked : t.value; saveOpenai(); return; }
    if (t.dataset.rgKind) { const r = itemOf(t.dataset.rgKind); if (r) { snapshot(); r.kind = t.value; drawCurrent(); afterChange(); } return; }
    if (t.dataset.side === 'kind') { snapshot(); PG().kind = t.value; renderPages(); renderSide(); renderLayers(); afterChange(); return; }
    if (t.dataset.side === 'ai-owner') { app.aiOwner = t.value; return; }
    const fr = t.closest('.font-row');
    if (fr && t.dataset.fk) {
      snapshot();
      const role = fr.dataset.role, k = t.dataset.fk;
      S().fonts[role][k] = k === 'size' ? Math.max(12, Math.min(140, Number(t.value) || 30)) : t.value;
      fr.querySelector('.sample').style.fontFamily = `'${S().fonts[role].family}'`;
      document.fonts.load(`20px "${S().fonts[role].family}"`).finally(() => { resizeAllText(); renderPages(); save(); });
    }
  });
  side.addEventListener('click', async (e) => {
    const t = e.target;
    const ld = t.closest('[data-ldel]');
    if (ld) { snapshot(); deleteItem(ld.dataset.ldel); drawCurrent(); renderSide(); afterChange(); return; }
    const lay = t.closest('.layer[data-layer]');
    if (lay) { app.selected = { kind: 'item', id: lay.dataset.layer }; drawCurrent(); return; }
    const b = t.closest('button, [data-del-char], [data-del-asset], [data-del-variant], [data-del-tpl]');
    if (!b) {
      const c = t.closest('.chip');
      if (c && c.dataset.kind) applyByClick(c.dataset.kind, c.dataset.value);
      return;
    }
    if (b.dataset.delChar) {
      const id = b.dataset.delChar;
      const used = P().pages.some((pg) => pg.panels.some((p) => p.items.some((i) => i.charId === id)));
      if (used && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '삭제?'; toast('컷에 놓인 인물도 함께 지워집니다. 한 번 더 누르면 삭제합니다.'); return; }
      snapshot();
      P().characters = P().characters.filter((c) => c.id !== id);
      for (const pg of P().pages) for (const p of pg.panels) {
        const gone = p.items.filter((i) => i.charId === id).map((i) => i.id);
        p.items = p.items.filter((i) => i.charId !== id);
        for (const o of p.items) if (gone.includes(o.tailTo)) o.tailTo = null;
      }
      renderSide(); renderPages(); afterChange();
      return;
    }
    if (b.dataset.delAsset) {
      e.stopPropagation();
      const id = b.dataset.delAsset;
      const inUse = app.episodes.some((ep) => ep.id !== app.ep.id && usedAssetIds(normalizeEp(clone(ep))).includes(id)) || usedAssetIds(app.ep).includes(id);
      if (inUse && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; toast('회차에서 쓰는 이미지입니다. 한 번 더 누르면 지우고, 쓰던 자리는 빈칸이 됩니다.'); return; }
      delete app.assets[id]; await store.del('assets', id);
      for (const c of P().characters) c.images = (c.images || []).filter((v) => v.assetId !== id);
      for (const pg of P().pages) for (const p of pg.panels) if (p.bgImage === id) delete p.bgImage;
      refreshCharacterItems(); renderSide(); renderPages(); save();
      return;
    }
    if (b.dataset.delVariant) {
      e.stopPropagation();
      snapshot();
      const [cid, vid] = b.dataset.delVariant.split('|');
      const ch = P().characters.find((c) => c.id === cid);
      ch.images = ch.images.filter((v) => v.id !== vid);
      for (const pg of P().pages) for (const p of pg.panels) for (const it of p.items) if (it.variantId === vid) delete it.variantId;
      refreshCharacterItems(cid); renderSide(); renderPages(); afterChange();
      return;
    }
    if (b.dataset.delTpl) {
      e.stopPropagation();
      app.templates = app.templates.filter((x) => x.id !== b.dataset.delTpl);
      store.lsSet(LS.templates, app.templates);
      for (const k of Object.keys(S().pageTemplates)) if (S().pageTemplates[k] === b.dataset.delTpl) S().pageTemplates[k] = k === 'content' ? 'auto' : `builtin-${k}`;
      renderSide(); return;
    }
    if (b.dataset.asset) { assetDialog(b.dataset.asset); return; }
    if (b.dataset.size) {
      const z = SIZES.find((x) => x.id === b.dataset.size);
      S().sizeId = z.id;
      if (z.id !== 'custom') { S().width = z.w; S().height = z.h; }
      setSetting('sizeId', z.id, { geometry: true });
      toast('크기를 바꿨습니다. "배치 가이드 다시 만들기"를 누르면 컷에 반영됩니다.');
      return;
    }
    if (b.dataset.layout) { setSetting('layout', b.dataset.layout, { geometry: true }); return; }
    if (b.dataset.texture) { setSetting('texture', b.dataset.texture); renderPages(); return; }
    if (b.dataset.btex) { setSetting('border.texture', b.dataset.btex); renderPages(); return; }
    if (b.dataset.style) { setSetting('style', b.dataset.style); refreshCharacterItems(); renderPages(); return; }
    if (b.dataset.anchor) { setSetting(`${b.dataset.anchor === 'wm' ? 'watermark' : 'pageNumber'}.anchor`, b.dataset.v); redrawAllMarks(); return; }
    if (b.dataset.tpl) {
      snapshot();
      const tpl = findTemplate(b.dataset.tpl, app.templates);
      const dropped = applyTemplate(PG(), tpl, S(), measure);
      for (const p of PG().panels) for (const it of p.items) if (it.type === 'character') updateItemImage(it);
      app.selected = null; renderPages(); renderSide(); renderLayers(); afterChange();
      toast(dropped ? `레이아웃을 적용했습니다. 컷이 줄어 ${dropped}개 컷의 내용은 빠졌습니다(되돌리기 가능).` : '레이아웃을 적용했습니다.');
      return;
    }
    if (b.dataset.preset) {
      snapshot();
      const n = layoutRows(b.dataset.preset).flat().length;
      const dropped = applyRects(PG(), computePanels(S(), b.dataset.preset, false, n), S(), measure);
      PG().templateId = 'auto'; PG().layoutId = b.dataset.preset;
      app.selected = null; renderPages(); renderSide(); renderLayers(); afterChange();
      toast(dropped ? `컷 나누기를 바꿨습니다. ${dropped}개 컷의 내용은 빠졌습니다(되돌리기 가능).` : '컷 나누기를 바꿨습니다.');
      return;
    }
    if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); toast(`${b.dataset.copy} 복사했습니다.`); } catch { toast(b.dataset.copy); } return; }
    if (b.dataset.aiPick) { app.aiPick = b.dataset.aiPick; renderSide(); return; }
    if (b.dataset.use || b.dataset.useSel) {
      const a = app.assets[app.aiPick];
      const u = a.guide.usages[Number(b.dataset.use ?? b.dataset.useSel)];
      snapshot();
      const ownerId = b.dataset.useSel ? itemOf(app.selected.id).charId : app.aiOwner;
      const v = addVariant(ownerId, a.id, u, a.guide.faceBox);
      if (!v) { app.undo.pop(); return; }
      if (b.dataset.useSel) { const it = itemOf(app.selected.id); it.variantId = v.id; }
      refreshCharacterItems(ownerId);
      renderPages(); renderSide(); afterChange();
      toast(b.dataset.useSel ? '선택한 인물에 적용했습니다. 원본 이미지는 그대로입니다.' : `'${u.title}'을(를) ${P().characters.find((c) => c.id === ownerId).name}의 이미지로 추가했습니다. 업로드 탭에서 끌어 쓸 수 있습니다.`);
      return;
    }
    if (b.dataset.ieAsset) { createImagePage(b.dataset.ieAsset); return; }
    if (b.dataset.rgDel) { snapshot(); deleteItem(b.dataset.rgDel); drawCurrent(); renderSide(); afterChange(); return; }
    const act = b.dataset.side;
    if (act === 'ie-upload') { $('#file-edit').click(); return; }
    if (act === 'ie-find') { runFindRegions(); return; }
    if (act === 'ie-add-char') { addRegion('character'); return; }
    if (act === 'ie-add-erase') { addRegion('bubble'); return; }
    if (act === 'ie-separate') { runSeparate(); return; }
    if (act === 'ie-reset') {
      const pn = editPanel(); snapshot();
      pn.bgImage = pn.imageEdit.original; delete pn.imageEdit.plate;
      pn.items = pn.items.filter((i) => i.type !== 'sticker' && i.type !== 'region');
      app.selected = null; drawCurrent(); renderSide(); afterChange(); toast('원본 그림으로 되돌렸습니다.');
      return;
    }
    if (!act) { if (b.dataset.kind && !b.dataset.apply) applyByClick(b.dataset.kind, b.dataset.value); return; }
    if (act === 'generate' || act === 'regen') {
      snapshot();
      const res = generateEp(app.ep);
      app.page = 0; app.selected = null; app.geometryDirty = false; app.zoomFit = true;
      renderEditor(); afterChange();
      toast(res.warnings[0] || `${P().pages.length}페이지 배치 가이드를 만들었습니다.`);
    }
    if (act === 'register') registerLayoutDialog();
    if (act === 'pick') $('#file-image').click();
    if (act === 'pick-drive') openDrivePicker({ multiple: true, onPick: (assets) => { renderSide(); toast(`Google 드라이브에서 이미지 ${assets.length}개를 가져왔습니다. 클릭해서 캐릭터 이미지로 등록하세요.`); } });
    if (act === 'ie-drive') openDrivePicker({ multiple: false, onPick: (assets) => { if (assets[0]) createImagePage(assets[0].id); } });
    if (act === 'check') { renderSide(); toast('검사했습니다.'); }
    if (act === 'ai-check') runAiCheck(b);
    if (act === 'ai-run' || act === 'ai-basic') runCharGuide(act === 'ai-run', b);
    if (act === 'save-defaults') { app.defaults = clone(S()); store.lsSet(LS.defaults, app.defaults); toast('기본값으로 저장했습니다. 새 회차를 만들 때 이 설정을 씁니다.'); }
  });
  side.addEventListener('submit', (e) => {
    if (e.target.id !== 'form-add-char') return;
    e.preventDefault();
    const name = $('#new-char-name').value.trim();
    if (!name) return;
    if (P().characters.some((c) => c.name === name)) { toast(`'${name}'은(는) 이미 있습니다.`); return; }
    snapshot();
    P().characters.push({ id: uid('c'), name, color: $('#new-char-color').value, images: [] });
    renderSide(); afterChange();
    toast(`${name}을(를) 추가했습니다. 컷으로 끌어다 놓으세요.`);
  });
  side.addEventListener('dragstart', (e) => {
    const c = e.target.closest('[data-kind]');
    if (!c) return;
    const data = JSON.stringify({ kind: c.dataset.kind, value: c.dataset.value });
    e.dataTransfer.setData('application/json', data);
    e.dataTransfer.setData('text/plain', data);
    e.dataTransfer.effectAllowed = 'copy';
  });
  side.addEventListener('keydown', (e) => {
    const c = e.target.closest('.chip');
    if (c && c.dataset.kind && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyByClick(c.dataset.kind, c.dataset.value); }
  });
  // 파일 끌어 오기
  side.addEventListener('dragover', (e) => { const z = e.target.closest('#drop-zone'); if (z && e.dataTransfer.types.includes('Files')) { e.preventDefault(); z.classList.add('over'); } });
  side.addEventListener('dragleave', (e) => { const z = e.target.closest('#drop-zone'); if (z) z.classList.remove('over'); });
  side.addEventListener('drop', (e) => { const z = e.target.closest('#drop-zone'); if (z && e.dataTransfer.files.length) { e.preventDefault(); z.classList.remove('over'); uploadFiles(e.dataTransfer.files); } });
  // 대사 가이드: 적용, 포커스
  side.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    const found = findItemAnywhere(btn.dataset.apply);
    if (!found) return;
    snapshot();
    updateLineItem(found, btn.dataset.text);
    drawPage(found.pi); renderSide(); afterChange();
    toast('권장 문장을 적용했습니다.');
  });
  side.addEventListener('focusin', (e) => {
    const id = e.target.dataset?.edit;
    if (!id) return;
    const found = findItemAnywhere(id);
    if (!found) return;
    snapshot();
    if (found.pi !== app.page) { const old = app.page; app.page = found.pi; drawPage(old); markCurrent(); }
    app.selected = { kind: 'item', id };
    drawCurrent();
    $(`.page-block[data-page="${found.pi}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
function redrawAllMarks() { P().pages.forEach((_, i) => drawPage(i)); }

async function uploadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) { toast('이미지 파일만 올릴 수 있습니다.'); return; }
  for (const f of list) {
    try { const a = await store.readImage(f); app.assets[a.id] = a; await store.put('assets', a); } catch (e) { toast(e.message); }
  }
  renderSide();
  toast(`이미지 ${list.length}개를 올렸습니다. 클릭해서 캐릭터 이미지로 등록하세요.`);
}

function assetDialog(id) {
  const a = app.assets[id];
  const chars = P().characters;
  openModal('이미지를 어디에 쓸까요?', `
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:16px"><img src="${safeImageUrl(a.url)}" alt="" style="width:140px;height:140px;object-fit:contain;background:#fff;border-radius:8px">
    <div style="display:grid;gap:10px;flex:1">
      <b>캐릭터 이미지로 등록</b>
      <div class="row"><select id="as-char" aria-label="캐릭터">${chars.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="__new">+ 새 캐릭터</option></select>
      <input id="as-new" placeholder="새 캐릭터 이름" hidden maxlength="12">
      <select id="as-emo" aria-label="표정">${opt(EMOTIONS, 'neutral')}</select></div>
      <p class="hint">감정별로 이미지를 등록하면 스크립트의 감정에 맞는 이미지가 자동으로 쓰입니다. 원본은 바꾸지 않습니다.</p>
      <div class="row"><button class="btn accent sm" id="as-reg">등록</button><button class="btn line sm" id="as-reg-ai">등록하고 AI 활용 가이드 보기</button></div>
      <b style="margin-top:6px">그 밖의 쓰임</b>
      <div class="row"><button class="btn line sm" id="as-wm">워터마크 이미지로</button><button class="btn line sm" id="as-bg" ${app.selected?.kind === 'panel' ? '' : 'disabled'}>선택한 컷 배경으로</button></div>
    </div></div>`, (body) => {
    const sel = $('#as-char', body), nn = $('#as-new', body);
    sel.addEventListener('change', () => { nn.hidden = sel.value !== '__new'; if (!nn.hidden) nn.focus(); });
    const reg = () => {
      let cid = sel.value;
      snapshot();
      if (cid === '__new') {
        const name = nn.value.trim();
        if (!name) { app.undo.pop(); toast('새 캐릭터 이름을 입력해 주세요.'); return null; }
        cid = uid('c');
        P().characters.push({ id: cid, name, color: CHARACTER_COLORS[P().characters.length % CHARACTER_COLORS.length], images: [] });
      }
      const ch = P().characters.find((c) => c.id === cid);
      ch.images = ch.images || [];
      ch.images.push({ id: uid('v'), assetId: id, emotion: $('#as-emo', body).value, transform: { crop: 'full' }, faceBox: a.guide?.faceBox, label: '' });
      refreshCharacterItems(cid);
      renderPages(); afterChange();
      return cid;
    };
    $('#as-reg', body).addEventListener('click', () => { const c = reg(); if (c) { closeModal(); renderSide(); toast('캐릭터 이미지로 등록했습니다. 이 캐릭터가 나오는 컷이 모두 이 이미지로 바뀌었습니다.'); } });
    $('#as-reg-ai', body).addEventListener('click', () => { const c = reg(); if (c) { closeModal(); app.aiPick = id; app.aiOwner = c; setTab('ai'); } });
    $('#as-wm', body).addEventListener('click', () => { S().watermark.type = 'image'; S().watermark.assetId = id; S().watermark.enabled = true; closeModal(); redrawAllMarks(); save(); toast('워터마크 이미지로 정했습니다. 설정 탭에서 위치를 고정하세요.'); });
    $('#as-bg', body).addEventListener('click', () => { const p = PG().panels.find((x) => x.id === app.selected.id); if (!p) return; snapshot(); p.bgImage = id; closeModal(); drawCurrent(); afterChange(); });
  });
}

function registerLayoutDialog() {
  const pg = PG();
  openModal('이 페이지를 레이아웃으로 등록', `
    <p class="hint">컷 위치와 글 상자 위치·글꼴·정렬을 저장합니다. 인물과 대사는 저장하지 않습니다. 직접 넣은 글(예: 계정 안내 문구)은 문구까지 저장합니다.</p>
    <label class="field"><span>이름</span><input id="tpl-name" value="${esc(`${pageKindLabel(pg.kind)} 레이아웃 ${app.templates.filter((t) => t.kind === pg.kind).length + 1}`)}" maxlength="30"></label>
    <label class="field"><span>종류</span><select id="tpl-kind">${opt(PAGE_KINDS, pg.kind)}</select></label>
    <label class="switch"><input type="checkbox" id="tpl-default" checked> 이 회차와 새 회차의 기본 레이아웃으로 쓰기</label>
    <div class="row"><button class="btn accent" id="tpl-save">등록</button></div>`, (b) => {
    $('#tpl-save', b).addEventListener('click', () => {
      const kind = $('#tpl-kind', b).value;
      const tpl = templateFromPage(pg, S(), $('#tpl-name', b).value.trim() || '내 레이아웃', kind);
      app.templates.push(tpl);
      store.lsSet(LS.templates, app.templates);
      if ($('#tpl-default', b).checked) {
        S().pageTemplates[kind] = tpl.id;
        app.defaults.pageTemplates[kind] = tpl.id; store.lsSet(LS.defaults, app.defaults);
      }
      pg.templateId = tpl.id;
      closeModal(); renderSide(); save();
      toast(`'${tpl.name}' 레이아웃을 등록했습니다.`);
    });
  });
}

async function runAiCheck(btn) {
  if (!app.apiKey) { setTab('settings'); toast('설정 탭 "AI 연결"에 API 키를 넣어 주세요.'); return; }
  const lines = allLines().filter((l) => l.item.text.trim()).map((l) => {
    const sp = l.item.tailTo ? l.panel?.items.find((o) => o.id === l.item.tailTo) : null;
    return { id: l.item.id, kind: l.item.kind || 'text', speaker: sp ? P().characters.find((c) => c.id === sp.charId)?.name : '', text: l.item.text };
  });
  if (!lines.length) { toast('검사할 대사가 없습니다.'); return; }
  btn.disabled = true; btn.textContent = 'Claude 검사 중…';
  try {
    const results = await aiCheck(app.apiKey, lines);
    for (const r of results) { const l = lines.find((x) => x.id === r.id); if (l) app.ai[r.id] = { text: l.text, result: r }; }
    renderSide(); toast(`Claude 가 ${results.length}줄을 검사했습니다.`);
  } catch (err) { toast(describeError(err)); btn.disabled = false; btn.textContent = 'Claude로 검사'; }
}
async function runCharGuide(useAi, btn) {
  const a = app.assets[app.aiPick];
  if (!a) return;
  if (useAi && !app.apiKey) { setTab('settings'); toast('설정 탭 "AI 연결"에 API 키를 넣어 주세요.'); return; }
  const owner = P().characters.find((c) => c.id === app.aiOwner);
  btn.disabled = true; btn.textContent = useAi ? '분석 중…' : '만드는 중…';
  try {
    const g = useAi ? await aiCharacterGuide(app.apiKey, a.url, owner?.name) : await basicGuide(a.url, owner?.name);
    a.guide = g;
    await store.put('assets', a);
    // 얼굴 위치를 알게 됐으니 이 이미지를 쓰는 인물의 말풍선 꼬리 위치를 고친다
    for (const c of P().characters) for (const v of c.images || []) if (v.assetId === a.id) v.faceBox = g.faceBox;
    refreshCharacterItems(); renderPages();
    renderSide(); save();
  } catch (err) { toast(describeError(err)); btn.disabled = false; btn.textContent = useAi ? 'Claude로 분석' : '기본 제안 (AI 없이)'; }
}

// ══ 그림 편집: 완성 그림 → 레이어 분리 → 표정 바꾸기 / 인물 빼기 ══════════
// 그림은 OpenAI 이미지 편집이 그리고(배경 채우기·오려 내기·표정), 위치 찾기는 Claude, 합성은 이 앱이 한다.
function editPanel() { return PG().panels.find((p) => p.imageEdit); }
function imgMap(panel) {
  const a = app.assets[panel.imageEdit.original];
  const s = Math.max(panel.w / a.w, panel.h / a.h); // 컷을 꽉 채우게(넘치는 부분은 잘림)
  return { a, s, ox: panel.x + (panel.w - a.w * s) / 2, oy: panel.y + (panel.h - a.h * s) / 2 };
}
const toImg = (m, r) => ({ x: (r.x - m.ox) / m.s, y: (r.y - m.oy) / m.s, w: r.w / m.s, h: r.h / m.s });
const toPage = (m, r) => ({ x: Math.round(r.x * m.s + m.ox), y: Math.round(r.y * m.s + m.oy), w: Math.round(r.w * m.s), h: Math.round(r.h * m.s) });
const openaiCfg = () => ({ apiKey: app.openaiKey, model: app.openai.model, quality: app.openai.quality });

async function addAsset(result, name) {
  const a = sanitizeAsset({ id: `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url: result.url, w: result.w, h: result.h, name });
  if (!a) throw new Error('만든 그림을 저장하지 못했습니다.');
  app.assets[a.id] = a;
  await store.put('assets', a);
  return a;
}
function setBusy(msg) {
  app.editBusy = msg;
  if (app.ui.tab === 'imgedit') { const sc = $('#side').scrollTop; renderSide(); $('#side').scrollTop = sc; }
  if (msg) toast(msg);
}
function needOpenai() {
  if (app.openaiKey) return false;
  setTab('imgedit'); toast('그림 편집 탭에서 OpenAI API 키를 먼저 넣어 주세요.');
  return true;
}

async function createImagePage(assetId) {
  snapshot();
  const W = S().width, H = S().height;
  const pg = {
    id: uid('pg'), kind: 'content', templateId: 'auto', texts: [],
    panels: [{ id: uid('p'), x: 0, y: 0, w: W, h: H, noBorder: true, background: { kind: 'none', night: false, label: '' }, note: '', bgImage: assetId, imageEdit: { original: assetId }, items: [] }],
  };
  const at = Math.min(app.page + 1, P().pages.length);
  P().pages.splice(at, 0, pg);
  app.page = at; app.selected = null;
  renderPages(); renderSide(); renderLayers(); afterChange();
  $(`.page-block[data-page="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const a = app.assets[assetId];
  const ratio = (a.w / a.h) / (W / H);
  toast(Math.abs(ratio - 1) > 0.03 ? `그림 비율이 캔버스(${W}×${H})와 달라 가장자리가 조금 잘려 보입니다. 설정에서 캔버스 크기를 그림에 맞출 수 있습니다.` : '그림으로 새 페이지를 만들었습니다. 다음은 영역 고르기입니다.');
}

async function runFindRegions() {
  if (!app.apiKey) { setTab('settings'); toast('캐릭터 찾기는 Claude를 씁니다. 설정 탭 "AI 연결"에 Anthropic API 키를 넣어 주세요. (직접 영역을 추가해도 됩니다)'); return; }
  const pn = editPanel(); const m = imgMap(pn);
  setBusy('Claude가 캐릭터와 말풍선 위치를 찾는 중…');
  try {
    const found = await aiFindRegions(app.apiKey, m.a.url, P().characters.map((c) => c.name));
    snapshot();
    pn.items = pn.items.filter((i) => i.type !== 'region');
    for (const r of found) pn.items.push({ id: uid('i'), type: 'region', kind: r.kind, name: r.name, ...toPage(m, { x: r.x * m.a.w, y: r.y * m.a.h, w: r.w * m.a.w, h: r.h * m.a.h }) });
    setBusy('');
    drawCurrent(); afterChange();
    toast(`캐릭터 ${found.filter((r) => r.kind === 'character').length}개, 지울 곳 ${found.filter((r) => r.kind === 'bubble').length}개를 찾았습니다. 상자를 끌어 위치·크기를 맞춰 주세요.`);
  } catch (e) { setBusy(''); toast(describeError(e)); }
}
function addRegion(kind) {
  const pn = editPanel();
  snapshot();
  const w = Math.round(pn.w * (kind === 'bubble' ? 0.35 : 0.3)), h = Math.round(pn.h * (kind === 'bubble' ? 0.15 : 0.35));
  const r = { id: uid('i'), type: 'region', kind, name: kind === 'bubble' ? '말풍선' : `캐릭터 ${pn.items.filter((i) => i.type === 'region' && i.kind === 'character').length + 1}`, x: Math.round(pn.x + (pn.w - w) / 2), y: Math.round(pn.y + (pn.h - h) / 2), w, h };
  pn.items.push(r);
  app.selected = { kind: 'item', id: r.id };
  drawCurrent(); renderSide(); afterChange();
}

async function runSeparate() {
  if (needOpenai()) return;
  const pn = editPanel(); const m = imgMap(pn);
  const regions = pn.items.filter((i) => i.type === 'region');
  if (!regions.length) { toast('먼저 캐릭터나 지울 곳 영역을 골라 주세요.'); return; }
  const src = app.assets[pn.imageEdit.original];
  const cfg = openaiCfg();
  const chars = regions.filter((r) => r.kind === 'character');
  const total = 1 + chars.length;
  const imgRect = (r, k) => expandRect(toImg(m, r), k, src.w, src.h);
  try {
    setBusy(`배경 채우는 중 (1/${total}) — 영역 안의 인물·말풍선을 지우고 주변에 맞게 그립니다`);
    const plate = await fillBackground({ cfg, imgUrl: src.url, rects: regions.map((r) => imgRect(r, r.kind === 'bubble' ? 0.04 : 0.06)) });
    const plateAsset = await addAsset(plate, '배경(채움)');
    snapshot();
    pn.bgImage = plateAsset.id; pn.imageEdit.plate = plateAsset.id;
    pn.items = pn.items.filter((i) => !(i.type === 'region' && i.kind === 'bubble'));
    drawCurrent(); save();
    const failed = [];
    for (let i = 0; i < chars.length; i++) {
      const r = chars[i];
      setBusy(`캐릭터 오려 내는 중 (${i + 2}/${total}) — ${r.name || '캐릭터'}`);
      try {
        const ir = imgRect(r, 0.06);
        const cut = await cutOutCharacter({ cfg, imgUrl: src.url, rect: ir, name: r.name, keepOriginalPixels: app.openai.keepPixels });
        const a = await addAsset(cut, r.name || '캐릭터');
        const ch = P().characters.find((c) => c.name && r.name && (r.name.includes(c.name) || c.name.includes(r.name)));
        const idx = pn.items.findIndex((x) => x.id === r.id);
        pn.items.splice(idx, 1, { id: uid('i'), type: 'sticker', assetId: a.id, ...toPage(m, ir), name: r.name || '캐릭터', charId: ch ? ch.id : null, versions: [] });
        drawCurrent(); save();
      } catch (e) { failed.push(`${r.name || '캐릭터'}: ${e.message}`); }
    }
    setBusy('');
    renderLayers(); afterChange();
    toast(failed.length ? `일부를 분리하지 못했습니다. ${failed[0]}` : '레이어를 분리했습니다. 캐릭터를 끌어 페이지 밖으로 빼거나, 선택해서 표정을 바꿔 보세요.');
  } catch (e) { setBusy(''); toast(e.message); }
}

async function runExpression(sticker, variantId) {
  if (needOpenai()) { drawCurrent(); return; }
  const ch = P().characters.find((c) => c.id === sticker.charId);
  const v = ch && ch.images.find((x) => x.id === variantId);
  const ref = v && app.assets[v.assetId];
  const cur = app.assets[sticker.assetId];
  if (!ref || !cur) { toast('표정 이미지를 찾지 못했습니다.'); return; }
  const label = v.label || EMOTIONS.find((e) => e.id === v.emotion)?.label || '';
  try {
    setBusy(`${ch.name}의 표정을 '${label}'(으)로 바꾸는 중…`);
    const out = await changeExpression({ cfg: openaiCfg(), layerUrl: cur.url, refUrl: ref.url, emotionLabel: label, name: ch.name, faceOnly: app.openai.faceOnly });
    const a = await addAsset(out, `${sticker.name} · ${label}`);
    snapshot();
    sticker.versions = [...(sticker.versions || []), sticker.assetId];
    sticker.assetId = a.id;
    setBusy('');
    drawCurrent(); afterChange();
    toast(`표정을 바꿨습니다. 마음에 안 들면 도구 막대의 "이전 버전"으로 되돌리거나 다시 바꿔 보세요.`);
  } catch (e) { setBusy(''); toast(e.message); drawCurrent(); }
}

function openaiSettingsHTML() {
  return `<div class="kv"><label for="oa-model">이미지 모델</label><select id="oa-model" data-oa="model">${IMAGE_MODELS.map((mdl) => `<option ${mdl === app.openai.model ? 'selected' : ''}>${mdl}</option>`).join('')}</select><span></span></div>
    <div class="kv"><label for="oa-quality">품질</label><select id="oa-quality" data-oa="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}" ${q === app.openai.quality ? 'selected' : ''}>${{ low: '낮음(싸고 빠름)', medium: '보통', high: '높음' }[q]}</option>`).join('')}</select><span></span></div>
    <p class="hint">키는 이 브라우저에만 저장되고 그림 편집 때 브라우저에서 OpenAI로 바로 보냅니다. 호출마다 요금이 듭니다(모델·품질·크기에 따라 다름).</p>`;
}

function sideImageEdit() {
  const pn = editPanel();
  const busy = app.editBusy ? `<div class="preview-box" role="status">⏳ ${esc(app.editBusy)}</div>` : '';
  const dis = app.editBusy ? 'disabled' : '';
  const keyBox = app.openaiKey ? '' : `<div class="issue fact" style="margin-bottom:10px"><span class="tag">그림 편집에는 OpenAI API 키가 필요합니다</span>${keyRow('openai')}</div>`;
  if (!pn) {
    const assets = Object.values(app.assets);
    return `<h2>그림 편집</h2>${busy}${keyBox}
      <p class="hint">완성된 웹툰 그림을 넣으면 ① 캐릭터·말풍선 영역을 고르고 ② 캐릭터를 레이어로 분리하고(뒤 배경은 AI가 채움) ③ 등록한 표정으로 바꾸거나, 캐릭터를 끌어 페이지 밖으로 빼낼 수 있습니다.</p>
      <button class="btn accent wide" data-side="ie-upload" ${dis} style="margin-top:10px">내 컴퓨터에서 그림 올리기</button>
      <button class="btn dark wide" data-side="ie-drive" ${dis} style="margin-top:6px">Google 드라이브에서 그림 고르기</button>
      ${assets.length ? `<h3>업로드한 그림으로 시작</h3><div class="tiles">${assets.map((a) => `<button class="tile" data-ie-asset="${a.id}" title="이 그림으로 새 페이지"><img src="${safeImageUrl(a.url)}" alt="${esc(a.name)}"></button>`).join('')}</div>` : ''}
      <p class="hint" style="margin-top:10px">표정 바꾸기를 쓰려면 업로드 탭에서 캐릭터별 표정 이미지(예: 감사)를 먼저 등록해 두세요.</p>`;
  }
  const regions = pn.items.filter((i) => i.type === 'region');
  const stickers = pn.items.filter((i) => i.type === 'sticker');
  const nChar = regions.filter((r) => r.kind === 'character').length;
  return `<h2>그림 편집</h2>${busy}${keyBox}
    <h3>1. 영역 고르기</h3>
    <div class="row"><button class="btn dark sm" data-side="ie-find" ${dis}>Claude로 찾기</button><button class="btn line sm" data-side="ie-add-char">＋ 캐릭터 영역</button><button class="btn line sm" data-side="ie-add-erase">＋ 지울 곳</button></div>
    <p class="hint" style="margin-top:6px">청록 상자 = 레이어로 분리할 캐릭터, 주황 상자 = 지울 곳(말풍선·글자). 상자를 끌고 모서리로 크기를 맞추세요. 상자는 캐릭터 전체를 넉넉히 감싸야 합니다.</p>
    ${regions.map((r) => `<div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="sr-only" for="rgn-${r.id}">영역 이름</label><input id="rgn-${r.id}" data-rg-name="${r.id}" value="${esc(r.name)}" style="flex:1"><select data-rg-kind="${r.id}" aria-label="영역 종류">${opt([{ id: 'character', label: '캐릭터' }, { id: 'bubble', label: '지울 곳' }], r.kind)}</select><button class="icon-btn" data-rg-del="${r.id}" aria-label="영역 삭제"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('')}
    <h3>2. 레이어 분리</h3>
    <label class="switch"><input type="checkbox" data-oa="keepPixels" ${app.openai.keepPixels ? 'checked' : ''}> 캐릭터는 원본 그림 그대로 쓰기 (AI는 윤곽만)</label>
    <button class="btn accent wide" data-side="ie-separate" ${dis || (regions.length ? '' : 'disabled')} style="margin-top:8px">레이어 분리하기 · OpenAI 호출 ${regions.length ? 1 + nChar : 0}번</button>
    <p class="hint" style="margin-top:6px">배경 채우기 1번 + 캐릭터마다 1번 호출합니다. 영역 밖의 배경은 원본 그대로 두고 영역 안만 AI가 채웁니다.</p>
    <h3>3. 레이어 <span class="muted">${stickers.length}개</span></h3>
    ${stickers.length ? stickers.map((st) => `<div class="layer" data-layer="${st.id}" role="button" tabindex="0"><span class="sw"><img src="${safeImageUrl(app.assets[st.assetId]?.url)}" alt="" style="width:100%;height:100%;object-fit:contain"></span><span class="nm">${esc(st.name)}${st.charId ? ` · ${esc(P().characters.find((c) => c.id === st.charId)?.name || '')}` : ' · 캐릭터 미지정'}</span><button class="del" data-ldel="${st.id}" aria-label="빼기">✕</button></div>`).join('') : '<p class="hint">분리하면 여기에 캐릭터 레이어가 생깁니다.</p>'}
    <label class="switch" style="margin-top:6px"><input type="checkbox" data-oa="faceOnly" ${app.openai.faceOnly ? 'checked' : ''}> 표정 바꿀 때 얼굴만 고치기 (몸·손은 그대로)</label>
    <p class="hint" style="margin-top:6px">캔버스에서 레이어를 클릭하면 도구 막대에서 캐릭터를 지정하고 표정을 고를 수 있습니다. 레이어를 페이지 밖으로 끌어내면 빠집니다.</p>
    <div class="group"><h3>되돌리기</h3><button class="btn line wide" data-side="ie-reset">원본 그림으로 되돌리기</button></div>
    ${app.openaiKey ? `<div class="group"><h3>OpenAI 설정</h3>${keyRow('openai')}${openaiSettingsHTML()}</div>` : ''}`;
}

// ── Google 드라이브에서 이미지 고르기 (업로드 탭·그림 편집) ─────────────
const picker = { path: [], files: null, sel: new Set(), busy: false, err: '' };
function pickerHTML(opts) {
  if (!app.google.clientId) return `<p>Google 드라이브를 쓰려면 먼저 첫 화면 <b>연결 설정</b>에 Google OAuth 클라이언트 ID를 넣어 주세요.</p>`;
  if (!drive.isConnected()) return `<p>Google 계정으로 연결하면 드라이브의 이미지를 고를 수 있습니다.</p><div class="row"><button class="btn accent" data-pk="connect">Google 드라이브 연결</button></div>${picker.err ? `<p style="color:var(--fix)">${esc(picker.err)}</p>` : ''}`;
  const root = { id: drive.folderIdFrom(app.google.folder) || '', name: app.google.folder ? '회차 폴더' : '내 드라이브(최근 이미지)' };
  const crumbs = [root, ...picker.path];
  const files = picker.files || [];
  const folders = files.filter((f) => f.mimeType === drive.MIME.folder);
  const imgs = files.filter((f) => f.mimeType !== drive.MIME.folder);
  return `<div class="crumbs">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<button data-pk-crumb="${i}">${esc(c.name)}</button> ›` : `<b>${esc(c.name)}</b>`)).join(' ')}</div>
    ${picker.err ? `<p style="color:var(--fix)">${esc(picker.err)}</p>` : ''}
    ${picker.busy ? '<div class="empty">불러오는 중…</div>' : ''}
    ${folders.length ? `<div class="folder-row" style="margin-bottom:10px">${folders.map((f) => `<button class="folder" data-pk-folder="${f.id}" data-name="${esc(f.name)}"><span class="fi">${ICON.folder}</span><span><b>${esc(f.name)}</b></span></button>`).join('')}</div>` : ''}
    ${imgs.length ? `<div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${imgs.map((f) => `<button class="tile" data-pk-file="${f.id}" aria-pressed="${picker.sel.has(f.id)}" style="${picker.sel.has(f.id) ? 'outline:3px solid var(--accent)' : ''}" title="${esc(f.name)}">${f.thumbnailLink ? `<img src="${esc(f.thumbnailLink)}" alt="${esc(f.name)}" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🖼'}))">` : '🖼'}<span class="tag">${esc(f.name.slice(0, 16))}</span></button>`).join('')}</div>` : (picker.busy ? '' : '<div class="empty">이 위치에 이미지가 없습니다.</div>')}
    <div class="row" style="margin-top:12px"><button class="btn accent" data-pk="import" ${picker.sel.size ? '' : 'disabled'}>${picker.sel.size ? `${picker.sel.size}개 가져오기` : '이미지를 고르세요'}</button><span class="hint">${opts.multiple ? '여러 개 고를 수 있습니다.' : '한 장을 고르세요.'}</span></div>`;
}
async function pickerList() {
  picker.busy = true; picker.err = ''; renderPicker();
  try {
    const cur = picker.path.length ? picker.path[picker.path.length - 1].id : drive.folderIdFrom(app.google.folder);
    picker.files = await drive.listImages(cur);
  } catch (e) { picker.err = e.code === 'scope' ? '드라이브 파일 보기 권한이 없습니다. 첫 화면 Google 드라이브에서 "권한 다시 받기"를 해 주세요.' : e.code === 'api-disabled' ? 'Google Cloud 프로젝트에서 Google Drive API를 켜 주세요.' : e.message; picker.files = []; }
  picker.busy = false; renderPicker();
}
let pickerOpts = null;
function renderPicker() { const b = $('#modal-body'); if (b && !$('#modal').hidden && pickerOpts) b.innerHTML = pickerHTML(pickerOpts); }
function openDrivePicker(opts) {
  pickerOpts = opts; picker.sel = new Set(); picker.err = '';
  openModal('Google 드라이브에서 이미지 고르기', pickerHTML(opts), (b) => {
    b.addEventListener('click', async (e) => {
      const t = e.target;
      const act = t.closest('[data-pk]')?.dataset.pk;
      if (act === 'connect') { try { await drive.connect(app.google.clientId); picker.path = []; await pickerList(); } catch (err) { picker.err = err.code === 'script' ? '이 화면에서는 Google 연결이 막혀 있습니다. 배포 주소에서 열어 주세요.' : err.message; renderPicker(); } return; }
      const fo = t.closest('[data-pk-folder]'); if (fo) { picker.path.push({ id: fo.dataset.pkFolder, name: fo.dataset.name }); picker.sel = new Set(); pickerList(); return; }
      const cr = t.closest('[data-pk-crumb]'); if (cr) { picker.path = picker.path.slice(0, Number(cr.dataset.pkCrumb)); picker.sel = new Set(); pickerList(); return; }
      const fi = t.closest('[data-pk-file]');
      if (fi) { const id = fi.dataset.pkFile; if (!opts.multiple) picker.sel = new Set(); if (picker.sel.has(id)) picker.sel.delete(id); else picker.sel.add(id); renderPicker(); return; }
      if (act === 'import') {
        const chosen = (picker.files || []).filter((f) => picker.sel.has(f.id));
        picker.busy = true; renderPicker();
        const added = [];
        for (const f of chosen) {
          try { const file = await drive.downloadFile(f); const a = await store.readImage(file, 2400); app.assets[a.id] = a; await store.put('assets', a); added.push(a); } catch (err) { toast(`${f.name}: ${err.message}`); }
        }
        picker.busy = false; pickerOpts = null; closeModal();
        if (added.length) opts.onPick(added);
      }
    });
  });
  if (drive.isConnected() && !picker.files) pickerList();
  else if (drive.isConnected()) renderPicker();
}

function setTab(tab) {
  if (app.ui.tab === tab && !app.ui.sideClosed) { app.ui.sideClosed = true; }
  else { app.ui.tab = tab; app.ui.sideClosed = false; }
  saveUi();
  $('.ed-body').classList.toggle('side-closed', app.ui.sideClosed);
  $$('.rail .rail-btn[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === app.ui.tab && !app.ui.sideClosed));
  if (!app.ui.sideClosed) renderSide();
  requestAnimationFrame(() => { applyZoom(); drawPage(app.page); });
}

// ── 내보내기 ─────────────────────────────────────────────────────────
const fontCache = new Map();
async function fontFaceCSS(families, text) {
  const chars = [...new Set(text)].join('');
  const css = [];
  for (const fam of families) {
    const key = `${fam}|${chars}`;
    if (fontCache.has(key)) { css.push(fontCache.get(key)); continue; }
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}&text=${encodeURIComponent(chars)}`);
    if (!res.ok) throw new Error('font');
    let rule = await res.text();
    for (const u of [...rule.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1])) {
      const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      rule = rule.replace(u, `data:font/woff2;base64,${btoa(bin)}`);
    }
    fontCache.set(key, rule);
    css.push(rule);
  }
  return css.join('\n');
}
function pageToPng(i, includeBg) {
  return new Promise(async (resolve) => {
    const pg = P().pages[i];
    const { width, height, inner } = renderPage(pg, { project: P(), settings: S(), assets: app.assets, index: i, total: P().pages.length, opts: { guides: false, background: includeBg } });
    const fams = new Set(['IBM Plex Sans KR']);
    let text = `${P().title || ''}0123456789/ -${S().watermark.text || ''}`;
    for (const p of pg.panels) for (const b of p.items) if (b.type === 'bubble') { fams.add(S().fonts[bubbleRole(b)].family); text += (b.lines || [b.text]).join(''); }
    for (const t of pg.texts) { fams.add((S().fonts[t.role] || S().fonts.dialogue).family); text += (t.lines || [t.text]).join('') + '•'; }
    if (pg.showTitle) fams.add(S().fonts.title.family);
    let fontCSS = '', note = '';
    try { fontCSS = await fontFaceCSS([...fams], text); } catch { note = '글꼴을 받지 못해 기본 글꼴로 그림'; }
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>${fontCSS}</style></defs>${inner}</svg>`;
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => resolve({ url: URL.createObjectURL(blob), note }), 'image/png');
    };
    im.onerror = () => resolve({ url: null, note: '이 페이지를 그리지 못했습니다' });
    im.src = url;
  });
}
async function exportAll() {
  const name = (app.ep.name || 'moatoon').replace(/[\\/:*?"<>|]/g, '');
  openModal('다운로드', `<label class="switch"><input type="checkbox" id="ex-bg" checked> 배경 가이드 선도 넣기</label><p class="hint" id="ex-status">페이지 이미지를 만드는 중…</p><div class="export-grid" id="ex-grid"></div><div class="row"><button class="btn accent" id="ex-all" disabled>모두 저장</button><span class="hint">저장 버튼이 안 되면 이미지를 오른쪽 클릭(휴대폰은 길게 눌러) 저장하세요.</span></div>`, (b) => {
    const build = async () => {
      const grid = $('#ex-grid', b);
      grid.innerHTML = '';
      $('#ex-all', b).disabled = true;
      const notes = new Set();
      for (let i = 0; i < P().pages.length; i++) {
        const r = await pageToPng(i, $('#ex-bg', b).checked);
        if (r.note) notes.add(r.note);
        const file = `${name}_${String(i + 1).padStart(2, '0')}.png`;
        grid.insertAdjacentHTML('beforeend', `<figure>${r.url ? `<img src="${r.url}" alt="${i + 1}페이지">` : '<div class="empty">실패</div>'}<figcaption>${i + 1} 페이지${r.url ? `<a class="btn dark sm" href="${r.url}" download="${file}">저장</a>` : ''}</figcaption></figure>`);
      }
      $('#ex-status', b).textContent = `${P().pages.length}장, 각 ${S().width}×${S().height}px PNG. ${[...notes].join(', ')}`;
      $('#ex-all', b).disabled = false;
    };
    $('#ex-bg', b).addEventListener('change', build);
    $('#ex-all', b).addEventListener('click', async () => { for (const a of $$('#ex-grid a', b)) { a.click(); await new Promise((r) => setTimeout(r, 350)); } });
    build();
  });
}

// ── 드라이브에 저장 ──────────────────────────────────────────────────
async function saveToDrive() {
  if (!app.google.clientId) { openConnSettings(); toast('Google OAuth 클라이언트 ID를 먼저 넣어 주세요.'); return; }
  const btn = $('#btn-drive-save');
  btn.disabled = true;
  try {
    if (!drive.isConnected()) await drive.connect(app.google.clientId);
    const src = app.ep.source || {};
    const res = await drive.save({ fileId: src.type === 'drive' ? src.fileId : null, name: app.ep.name || '회차', folderId: src.folderId || drive.folderIdFrom(app.google.folder), json: episodeJson(app.ep) });
    app.ep.source = { type: 'drive', fileId: res.id || src.fileId, folderId: src.folderId || (res.parents && res.parents[0]) || '' };
    save();
    toast('Google 드라이브에 저장했습니다.');
  } catch (e) { toast(e.message); }
  btn.disabled = false;
}

// ── 시작 ─────────────────────────────────────────────────────────────
function bindEditor() {
  $('#btn-home').addEventListener('click', goHome);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-export').addEventListener('click', exportAll);
  $('#btn-drive-save').addEventListener('click', saveToDrive);
  $('#btn-size').addEventListener('click', () => { app.ui.tab = 'settings'; app.ui.sideClosed = false; saveUi(); renderEditor(); });
  $('#ep-name').addEventListener('change', (e) => { app.ep.name = e.target.value.trim() || '회차'; save(); });
  $$('.rail .rail-btn[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#btn-side-toggle').addEventListener('click', () => { app.ui.sideClosed = !app.ui.sideClosed; saveUi(); renderEditor(); });
  $('#btn-layers').addEventListener('click', () => { app.ui.layersClosed = !app.ui.layersClosed; saveUi(); renderEditor(); });
  $('#toggle-guides').addEventListener('change', (e) => { app.ui.guides = e.target.checked; saveUi(); renderPages(); });
  $('#zoom-in').addEventListener('click', () => setZoom(app.zoom * 1.15));
  $('#zoom-out').addEventListener('click', () => setZoom(app.zoom / 1.15));
  $('#zoom-fit').addEventListener('click', () => { app.zoomFit = true; applyZoom(); drawPage(app.page); });
  $('#file-image').addEventListener('change', (e) => { uploadFiles(e.target.files); e.target.value = ''; });
  $('#file-edit').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { const a = await store.readImage(f, 2400); app.assets[a.id] = a; await store.put('assets', a); createImagePage(a.id); } catch (err) { toast(err.message); }
  });
  const ie = $('#inline-edit');
  ie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commitInlineEdit(); }
    if (e.key === 'Escape') commitInlineEdit(true);
  });
  ie.addEventListener('blur', () => commitInlineEdit());
  $('#canvas-area').addEventListener('scroll', positionToolbar);
  window.addEventListener('resize', () => { if (app.view === 'editor') { applyZoom(); drawPage(app.page); } });
  document.addEventListener('keydown', (e) => {
    if (app.view !== 'editor' || !$('#modal').hidden) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveToDrive(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && app.selected?.kind === 'item') {
      e.preventDefault(); snapshot(); deleteItem(app.selected.id); drawCurrent(); afterChange();
    }
    if (e.key === 'Escape' && !typing) { app.selected = null; drawCurrent(); }
  });
}

async function init() {
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  bindHome(); bindEditor(); bindCanvas(); bindToolbar(); bindSide(); bindLayers();
  for (const raw of await store.all('assets')) { const a = sanitizeAsset(raw); if (a) app.assets[a.id] = a; }
  app.episodes = (await store.all('episodes')).map((e) => e);
  // 예전 버전(한 페이지) 작업을 회차로 옮긴다
  const old = store.lsGet(LS.old, null);
  if (old && old.project && !store.lsGet(LS.migrated, false)) {
    const ep = normalizeEp({ id: uid('ep'), name: '이전 작업', script: old.script || '', settings: withDefaults({ ...old.settings, showTitle: true }), project: old.project, source: { type: 'local' }, updated: Date.now() });
    await store.put('episodes', ep); app.episodes.push(ep);
    store.lsSet(LS.migrated, true);
  }
  await fontsReady();
  if (!app.episodes.length) {
    const ep = newEpisode(SAMPLE, '');
    await store.put('episodes', ep); app.episodes.push(ep);
  }
  app.view = 'home';
  showView();
}

init();
window.__moatoon = { app, openEpisode, applyMaterial, generateEp, renderEditor };
