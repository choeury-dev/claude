import {
  EMOTIONS, ACTIONS, BUBBLES, FONT_ROLES, FONTS, BACKGROUNDS, LAYOUTS, SIZES, STYLES, CHARACTER_COLORS, defaultSettings,
} from './catalog.js';
import { parseScript } from './script.js';
import {
  uid, generateProject, sizeBubble, MIN_BUBBLE, placeBubble, refineCharacter, reflowBubbles, nearestCharacter,
  characterBox, defaultCharSize, groundY, layoutRows, bubbleRole,
} from './layout.js';
import { renderProject, face, figure } from './render.js';
import { checkLine } from './spell.js';
import { aiCheck, describeError } from './ai.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'moatoon.v1';

const SAMPLE = `제목: 커피 한 잔의 비밀
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
준호(피곤): 어떻해… 안되…`;

// ── 상태 ─────────────────────────────────────────────────────────────
const state = {
  view: 'edit',
  settings: defaultSettings(),
  script: SAMPLE,
  project: null, // { title, characters, panels }
  selected: null, // { kind: 'item'|'panel'|'title', id }
  guides: true,
  ai: {}, // bubbleId -> Claude 결과
  apiKey: '',
};
const history = [];

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !d.project) return false;
    state.settings = { ...defaultSettings(), ...d.settings, fonts: { ...defaultSettings().fonts, ...(d.settings || {}).fonts } };
    state.script = d.script ?? SAMPLE;
    state.project = d.project;
    state.view = d.view || 'edit';
    state.guides = d.guides !== false;
    return true;
  } catch { return false; }
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ settings: state.settings, script: state.script, project: state.project, view: state.view, guides: state.guides })); } catch { /* 저장 불가 환경 */ }
  }, 250);
}
function loadKey() { try { state.apiKey = localStorage.getItem(STORE + '.key') || ''; } catch { /* */ } }
function saveKey() { try { localStorage.setItem(STORE + '.key', state.apiKey); } catch { /* */ } }

function snapshot() {
  history.push(JSON.stringify(state.project));
  if (history.length > 60) history.shift();
}
function undo() {
  const prev = history.pop();
  if (!prev) { toast('되돌릴 작업이 없습니다.'); return; }
  state.project = JSON.parse(prev);
  state.selected = null;
  renderEdit();
  save();
}

// ── 글자 폭 측정 ─────────────────────────────────────────────────────
const mctx = document.createElement('canvas').getContext('2d');
function measure(text, family, size) {
  mctx.font = `${size}px "${family}", sans-serif`;
  return mctx.measureText(text).width;
}

// ── 도우미 ───────────────────────────────────────────────────────────
const P = () => state.project;
const panelOf = (id) => P().panels.find((p) => p.items.some((i) => i.id === id));
const itemOf = (id) => { for (const p of P().panels) { const it = p.items.find((i) => i.id === id); if (it) return it; } return null; };
const charOf = (item) => P().characters.find((c) => c.id === item.charId);
const panelAt = (x, y) => P().panels.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
const style = () => state.settings.style;

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function resizeBubble(b, panel) {
  const keep = { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  Object.assign(b, sizeBubble(b, panel, state.settings, measure));
  b.x = Math.round(keep.cx - b.w / 2);
  b.y = Math.round(keep.cy - b.h / 2);
  placeBubble(panel, b, panel.items, style(), { ideal: keep, pull: 3 });
}
function resizeAllBubbles() {
  for (const p of P().panels) for (const b of p.items) if (b.type === 'bubble') resizeBubble(b, p);
}

// ── 생성 ─────────────────────────────────────────────────────────────
function generate() {
  const parsed = parseScript(state.script, P() ? P().characters.map((c) => c.name) : []);
  if (P()) snapshot();
  const res = generateProject(parsed, state.settings, P() ? P().characters : [], measure);
  state.project = { title: res.title, characters: res.characters, panels: res.panels };
  state.ai = {};
  state.selected = null;
  save();
  return res;
}

// ── 화면 전환 ────────────────────────────────────────────────────────
function setView(v) {
  state.view = v;
  for (const id of ['setup', 'script', 'edit']) {
    $(`#view-${id}`).hidden = id !== v;
    $(`#tab-${id}`).setAttribute('aria-selected', String(id === v));
  }
  if (v === 'setup') renderSetup();
  if (v === 'script') renderScriptPreview();
  if (v === 'edit') renderEdit();
  save();
}

// ── 1. 설정 화면 ─────────────────────────────────────────────────────
function layoutThumb(rows, w = 60, h = 72) {
  const g = 3, m = 3;
  const rh = (h - m * 2 - g * (rows.length - 1)) / rows.length;
  let y = m, out = '';
  for (const row of rows) {
    const tot = row.reduce((a, b) => a + b, 0);
    const iw = w - m * 2 - g * (row.length - 1);
    let x = m;
    for (const c of row) { const cw = (iw * c) / tot; out += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="none" stroke="currentColor" stroke-width="1.6"/>`; x += cw + g; }
    y += rh + g;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out}</svg>`;
}

function fontSettingsHTML(prefix) {
  return FONT_ROLES.map((r) => {
    const f = state.settings.fonts[r.id];
    const sample = r.id === 'title' ? '커피 한 잔의 비밀' : r.id === 'dialogue' ? '오늘 커피는 내가 살게!' : '뭔가 수상한데…';
    return `<div class="font-row" data-role="${r.id}">
      <span class="role">${r.label}</span>
      <label class="sr-only" for="${prefix}-ff-${r.id}">${r.label} 글꼴</label>
      <select id="${prefix}-ff-${r.id}" data-k="family">${FONTS.map((n) => `<option ${n === f.family ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label class="sr-only" for="${prefix}-fs-${r.id}">${r.label} 크기</label>
      <input id="${prefix}-fs-${r.id}" data-k="size" type="number" min="12" max="140" value="${f.size}" title="크기(px)">
      <div class="sample" style="font-family:'${f.family}'">${sample}</div>
    </div>`;
  }).join('');
}

function bindFontSettings(container, after) {
  container.querySelectorAll('.font-row').forEach((row) => {
    row.addEventListener('change', (e) => {
      const role = row.dataset.role, k = e.target.dataset.k;
      if (!k) return;
      if (P()) snapshot();
      state.settings.fonts[role][k] = k === 'size' ? Math.max(12, Math.min(140, Number(e.target.value) || 30)) : e.target.value;
      row.querySelector('.sample').style.fontFamily = `'${state.settings.fonts[role].family}'`;
      document.fonts.load(`20px "${state.settings.fonts[role].family}"`).finally(() => {
        if (P()) resizeAllBubbles();
        save();
        after && after();
      });
    });
  });
}

function renderSetup() {
  const s = state.settings;
  $('#size-options').innerHTML = SIZES.map((z) => `<button class="choice" data-size="${z.id}" aria-pressed="${s.sizeId === z.id}">${z.label}<small>${z.id === 'custom' ? '아래에 입력' : `${z.w} × ${z.h}`}</small></button>`).join('');
  $('#layout-options').innerHTML = LAYOUTS.map((l) => `<button class="choice" data-layout="${l.id}" aria-pressed="${s.layout === l.id}">${l.rows ? layoutThumb(l.rows) : `<svg width="60" height="72" viewBox="0 0 60 72" aria-hidden="true"><text x="30" y="42" text-anchor="middle" font-size="22" fill="currentColor">자동</text></svg>`}${l.label}</button>`).join('');
  $('#style-options').innerHTML = STYLES.map((st) => `<button class="choice" data-style="${st.id}" aria-pressed="${s.style === st.id}"><svg width="70" height="84" viewBox="-70 -215 140 225" aria-hidden="true" style="background:#fff;border-radius:6px">${figure(st.id, 'happy', 'wave', '#0c8599')}</svg>${st.label}<small>${st.note}</small></button>`).join('');
  $('#set-w').value = s.width; $('#set-h').value = s.height;
  $('#set-margin').value = s.margin; $('#out-margin').textContent = `${s.margin}px`;
  $('#set-gutter').value = s.gutter; $('#out-gutter').textContent = `${s.gutter}px`;
  $('#set-showtitle').checked = s.showTitle;
  $('#font-settings-setup').innerHTML = fontSettingsHTML('st');
  bindFontSettings($('#font-settings-setup'));
}

function bindSetup() {
  const v = $('#view-setup');
  v.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = state.settings;
    if (b.dataset.size) {
      const z = SIZES.find((x) => x.id === b.dataset.size);
      s.sizeId = z.id;
      if (z.id !== 'custom') { s.width = z.w; s.height = z.h; }
      markLayoutDirty();
    } else if (b.dataset.layout) { s.layout = b.dataset.layout; markLayoutDirty(); }
    else if (b.dataset.style) { s.style = b.dataset.style; if (P()) for (const p of P().panels) reflowBubbles(p, s.style, s, measure); }
    else if (b.dataset.goto) { setView(b.dataset.goto); return; }
    else return;
    renderSetup(); save();
  });
  const num = (id, key, lo, hi) => $(id).addEventListener('change', (e) => {
    state.settings[key] = Math.max(lo, Math.min(hi, Number(e.target.value) || lo));
    state.settings.sizeId = SIZES.find((z) => z.w === state.settings.width && z.h === state.settings.height)?.id || 'custom';
    markLayoutDirty(); renderSetup(); save();
  });
  num('#set-w', 'width', 400, 4000); num('#set-h', 'height', 400, 6000);
  for (const k of ['margin', 'gutter']) {
    $(`#set-${k}`).addEventListener('input', (e) => { state.settings[k] = Number(e.target.value); $(`#out-${k}`).textContent = `${e.target.value}px`; markLayoutDirty(); save(); });
  }
  $('#set-showtitle').addEventListener('change', (e) => { state.settings.showTitle = e.target.checked; markLayoutDirty(); save(); });
}
let layoutDirty = false;
function markLayoutDirty() {
  layoutDirty = true;
  $('#setup-note').textContent = '크기·레이아웃이 바뀌었습니다. 스크립트 단계에서 "배치 가이드 만들기"를 누르면 컷에 반영됩니다.';
}

// ── 2. 스크립트 화면 ────────────────────────────────────────────────
function renderScriptPreview() {
  const ta = $('#script-text');
  if (ta.value !== state.script) ta.value = state.script;
  const parsed = parseScript(state.script);
  const n = parsed.scenes.length;
  const layoutId = state.settings.layout;
  const panels = layoutId === 'auto' ? n : layoutRows(layoutId).flat().length;
  const warn = [...parsed.warnings];
  if (layoutId !== 'auto' && n > panels) warn.push(`장면 ${n}개 > 컷 ${panels}개: 뒤 장면은 빠집니다.`);
  $('#script-preview').innerHTML = `<b>장면 ${n}개</b> · 인물 ${parsed.characters.length}명${parsed.characters.length ? ` (${parsed.characters.map(esc).join(', ')})` : ''}
    <ol>${parsed.scenes.map((sc) => `<li>${esc(sc.desc || '(설명 없음)')} — 배경 ${esc(BACKGROUNDS.find((b) => b.id === sc.background.kind).label)}${sc.background.night ? '·밤' : ''}, 대사 ${sc.lines.length}줄</li>`).join('')}</ol>
    ${warn.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}`;
}

// ── 3. 편집 화면 ─────────────────────────────────────────────────────
function iconSVG(inner, vb = '-70 -215 140 225') {
  return `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
}
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

function chip(kind, value, label, icon = '') {
  return `<span class="chip" draggable="true" tabindex="0" role="button" data-kind="${kind}" data-value="${esc(value)}">${icon}${esc(label)}</span>`;
}

function renderPalette() {
  const chars = P().characters;
  $('#pal-characters').innerHTML = chars.map((c) => `<span class="chip" draggable="true" tabindex="0" role="button" data-kind="character" data-value="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}<button class="x" data-del-char="${c.id}" title="${esc(c.name)} 삭제" aria-label="${esc(c.name)} 삭제">×</button></span>`).join('') || '<span class="hint">스크립트에서 이름을 쓰거나 아래에서 추가하세요.</span>';
  $('#new-char-color').value = CHARACTER_COLORS[chars.length % CHARACTER_COLORS.length];
  $('#pal-emotions').innerHTML = EMOTIONS.map((e) => chip('emotion', e.id, e.label, iconSVG(`<circle cx="15" cy="15" r="13" fill="#fff6ee" stroke="#1b1f2a" stroke-width="1.6"/>${face(15, 15, 12, e.id)}`, '0 0 30 30'))).join('');
  $('#pal-actions').innerHTML = ACTIONS.map((a) => chip('action', a.id, a.label, iconSVG(figure('stick', 'neutral', a.id, '#5f6b7d')))).join('');
  $('#pal-bubbles').innerHTML = BUBBLES.map((b) => chip('bubble', b.id, b.label, bubbleIcon(b.id))).join('');
  $('#pal-fonts').innerHTML = FONT_ROLES.filter((r) => r.id !== 'title').map((r) => chip('font', r.id, `${r.label} 글꼴 입히기`)).join('');
  $('#pal-backgrounds').innerHTML = BACKGROUNDS.map((b) => chip('background', b.id, b.label)).join('');
  const fe = $('#font-settings-edit');
  fe.innerHTML = fontSettingsHTML('ed');
  bindFontSettings(fe, () => renderStage());
}

function renderStage() {
  const svg = $('#stage');
  const { width, height, inner } = renderProject({ ...P(), settings: state.settings }, { guides: state.guides });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.classList.toggle('no-guides', !state.guides);
  let sel = '';
  const s = state.selected;
  if (s && s.kind === 'item') {
    const it = itemOf(s.id);
    if (it) {
      const b = it.type === 'character' ? characterBox(it, style()) : it;
      sel = `<rect class="sel-box" x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="8"/>` + handlesSVG(b);
    } else state.selected = null;
  } else if (s && s.kind === 'panel') {
    const p = P().panels.find((x) => x.id === s.id);
    if (p) sel = `<rect class="sel-box" x="${p.x - 5}" y="${p.y - 5}" width="${p.w + 10}" height="${p.h + 10}"/>`;
  }
  svg.innerHTML = inner + sel;
  fitStage();
  const nb = P().panels.reduce((a, p) => a + p.items.filter((i) => i.type === 'bubble').length, 0);
  $('#stage-info').textContent = `${width} × ${height}px · ${P().panels.length}컷 · 말풍선 ${nb}개 · 그림체 ${STYLES.find((x) => x.id === style()).label}`;
  renderToolbar();
}

// 선택 상자 네 모서리의 크기 조절 손잡이. 화면에서 늘 같은 크기로 보이게 캔버스 배율로 나눈다.
const CORNERS = { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] };
function stageScale() {
  const w = $('#stage').getBoundingClientRect().width;
  return w ? w / state.settings.width : 1;
}
function handlesSVG(b) {
  const k = stageScale();
  const s = 14 / k, hit = 28 / k;
  return Object.entries(CORNERS).map(([c, [fx, fy]]) => {
    const x = b.x - 6 + (b.w + 12) * fx, y = b.y - 6 + (b.h + 12) * fy;
    return `<g class="handle" data-corner="${c}"><rect x="${x - hit / 2}" y="${y - hit / 2}" width="${hit}" height="${hit}" fill="transparent"/><rect class="handle-dot" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" stroke-width="${2 / k}"/></g>`;
  }).join('');
}

// 모서리를 끄는 동안: 반대쪽 모서리를 고정점으로 크기를 바꾼다.
function resizeTo(r, pt, keepRatio) {
  const it = itemOf(r.id);
  const panel = panelOf(r.id);
  const [fx, fy] = CORNERS[r.corner];
  const ax = r.box.x + r.box.w * (1 - fx), ay = r.box.y + r.box.h * (1 - fy); // 고정점
  if (it.type === 'character') {
    // 인물은 비율을 지키며 키운다. 끄는 거리 중 더 많이 움직인 쪽을 따른다.
    const k = Math.max(Math.abs(pt.x - ax) / r.box.w, Math.abs(pt.y - ay) / r.box.h);
    const h = Math.max(30, r.box.h * k);
    const scale = h / r.box.h;
    it.size = Math.round(Math.max(30, r.size * scale));
    const nb = characterBox(it, style());
    const left = fx ? ax : ax - nb.w, top = fy ? ay : ay - nb.h;
    it.x = Math.round(left + nb.w / 2);
    it.y = Math.round(top + nb.h);
  } else {
    let w = Math.max(MIN_BUBBLE.w, Math.abs(pt.x - ax)), h = Math.max(MIN_BUBBLE.h, Math.abs(pt.y - ay));
    if (keepRatio) { const k = Math.max(w / r.box.w, h / r.box.h); w = r.box.w * k; h = r.box.h * k; }
    // 컷 밖으로는 넘어가지 않게
    w = Math.min(w, fx ? panel.x + panel.w - ax : ax - panel.x);
    h = Math.min(h, fy ? panel.y + panel.h - ay : ay - panel.y);
    it.manual = true;
    it.w = Math.round(w); it.h = Math.round(h);
    it.x = Math.round(fx ? ax : ax - it.w);
    it.y = Math.round(fy ? ay : ay - it.h);
    Object.assign(it, sizeBubble(it, panel, state.settings, measure));
  }
}

function fitStage() {
  const wrap = $('#stage-wrap'), svg = $('#stage');
  const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 36;
  const W = state.settings.width, H = state.settings.height;
  const k = Math.min(availW / W, Math.max(availH, 360) / H, 1);
  svg.style.width = `${Math.max(240, Math.floor(W * k))}px`;
}

function renderEdit() {
  if (!P()) generate();
  renderPalette();
  renderStage();
  renderGuide();
  $('#toggle-guides').checked = state.guides;
}

// ── 선택 툴바 ────────────────────────────────────────────────────────
function opt(list, cur) { return list.map((o) => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join(''); }

function renderToolbar() {
  const tb = $('#toolbar');
  const s = state.selected;
  let html = '';
  if (s && s.kind === 'item') {
    const it = itemOf(s.id);
    if (!it) { tb.hidden = true; return; }
    if (it.type === 'character') {
      html = `<span class="lbl">${esc(charOf(it)?.name || '인물')}</span>
        <select data-act="emotion" aria-label="감정">${opt(EMOTIONS, it.emotion)}</select>
        <select data-act="action" aria-label="동작">${opt(ACTIONS, it.action)}</select>
        <button class="small" data-act="flip" title="좌우 반전">반전</button>
        <button class="small" data-act="bigger" title="크게">＋</button>
        <button class="small" data-act="smaller" title="작게">－</button>
        <button class="small" data-act="say">대사 추가</button>
        <button class="small danger" data-act="delete">삭제</button>`;
    } else {
      const panel = panelOf(it.id);
      const targets = [{ id: '', label: '꼬리 없음' }, ...panel.items.filter((o) => o.type === 'character').map((o) => ({ id: o.id, label: `→ ${charOf(o)?.name || '인물'}` }))];
      html = `<select data-act="kind" aria-label="말풍선 종류">${opt(BUBBLES, it.kind)}</select>
        <select data-act="tail" aria-label="말하는 인물">${opt(targets, it.tailTo || '')}</select>
        <select data-act="role" aria-label="글꼴">${opt(FONT_ROLES, bubbleRole(it))}</select>
        <button class="small" data-act="edit">대사 고치기</button>
        ${it.manual ? '<button class="small" data-act="autosize" title="글에 맞춰 말풍선 크기를 다시 정함">자동 크기</button>' : ''}
        <button class="small danger" data-act="delete">삭제</button>`;
    }
  } else if (s && s.kind === 'panel') {
    const p = P().panels.find((x) => x.id === s.id);
    if (!p) { tb.hidden = true; return; }
    html = `<span class="lbl">${P().panels.indexOf(p) + 1}컷 배경</span>
      <select data-act="bg" aria-label="배경">${opt(BACKGROUNDS, p.background.kind)}</select>
      <label class="check"><input type="checkbox" data-act="night" ${p.background.night ? 'checked' : ''}> 밤</label>
      <button class="small" data-act="narr">내레이션 추가</button>
      <button class="small" data-act="tidy">말풍선 다시 정리</button>`;
  } else { tb.hidden = true; return; }
  tb.innerHTML = html;
  tb.hidden = false;
  positionToolbar();
}

function positionToolbar() {
  const tb = $('#toolbar');
  if (tb.hidden) return;
  const wrap = $('#stage-wrap');
  const box = $('#stage .sel-box');
  if (!box) { tb.hidden = true; return; }
  const r = box.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  const tbw = tb.offsetWidth, tbh = tb.offsetHeight;
  let left = r.left - w.left + wrap.scrollLeft + r.width / 2 - tbw / 2;
  let top = r.top - w.top + wrap.scrollTop - tbh - 8;
  if (top < wrap.scrollTop + 4) top = r.bottom - w.top + wrap.scrollTop + 8;
  left = Math.max(8, Math.min(left, wrap.scrollWidth - tbw - 8));
  tb.style.left = `${left}px`;
  tb.style.top = `${top}px`;
}

function bindToolbar() {
  const tb = $('#toolbar');
  const run = (act, value) => {
    const s = state.selected;
    if (!s) return;
    snapshot();
    if (s.kind === 'panel') {
      const p = P().panels.find((x) => x.id === s.id);
      if (act === 'bg') { const b = BACKGROUNDS.find((x) => x.id === value); p.background = { ...p.background, kind: value, label: b.label }; }
      if (act === 'night') p.background.night = value;
      if (act === 'narr') addBubble(p, 'narration', null, '내레이션을 입력하세요');
      if (act === 'tidy') reflowBubbles(p, style(), state.settings, measure, false);
    } else {
      const it = itemOf(s.id), panel = panelOf(s.id);
      if (it.type === 'character') {
        if (act === 'emotion') it.emotion = value;
        if (act === 'action') { it.action = value; reflowBubbles(panel, style(), state.settings, measure); }
        if (act === 'flip') it.flip = !it.flip;
        if (act === 'bigger' || act === 'smaller') { it.size = Math.round(Math.max(40, it.size * (act === 'bigger' ? 1.12 : 0.89))); reflowBubbles(panel, style(), state.settings, measure); }
        if (act === 'say') { const b = addBubble(panel, 'speech', it.id, '대사를 입력하세요'); state.selected = { kind: 'item', id: b.id }; renderEdit(); save(); startInlineEdit(b.id); return; }
      } else {
        if (act === 'kind') { it.kind = value; delete it.fontRole; resizeBubble(it, panel); }
        if (act === 'tail') { it.tailTo = value || null; placeBubble(panel, it, panel.items, style(), { ideal: { x: it.x + it.w / 2, y: it.y + it.h / 2 }, pull: 2 }); }
        if (act === 'role') { it.fontRole = value; resizeBubble(it, panel); }
        if (act === 'autosize') { delete it.manual; resizeBubble(it, panel); }
        if (act === 'edit') { history.pop(); startInlineEdit(it.id); return; }
      }
      if (act === 'delete') { panel.items = panel.items.filter((o) => o.id !== it.id); for (const o of panel.items) if (o.tailTo === it.id) o.tailTo = null; state.selected = null; }
    }
    renderStage(); renderGuide(); save();
  };
  tb.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) run(b.dataset.act); });
  tb.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset.act) return;
    run(el.dataset.act, el.type === 'checkbox' ? el.checked : el.value);
  });
}

function addBubble(panel, kind, tailTo, text) {
  const b = { id: uid('i'), type: 'bubble', kind, text, tailTo, x: panel.x, y: panel.y, w: 10, h: 10 };
  Object.assign(b, sizeBubble(b, panel, state.settings, measure));
  const prev = panel.items.filter((o) => o.type === 'bubble').pop();
  placeBubble(panel, b, panel.items, style(), { prev });
  panel.items.push(b);
  return b;
}

// ── 바로 고치기 ──────────────────────────────────────────────────────
function startInlineEdit(id) {
  const it = itemOf(id);
  const ta = $('#inline-edit');
  const svg = $('#stage'), wrap = $('#stage-wrap');
  let box, text, family, size;
  if (id === 'title') {
    const tH = state.settings.fonts.title.size * 1.9;
    box = { x: state.settings.margin, y: state.settings.margin, w: state.settings.width - state.settings.margin * 2, h: tH };
    text = P().title; family = state.settings.fonts.title.family; size = state.settings.fonts.title.size;
  } else {
    if (!it || it.type !== 'bubble') return;
    box = it; text = it.text;
    const f = state.settings.fonts[bubbleRole(it)];
    family = f.family; size = it.fontSize || f.size;
  }
  const k = svg.getBoundingClientRect().width / state.settings.width;
  const sr = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const w = Math.max(180, box.w * k), h = Math.max(70, box.h * k);
  ta.style.left = `${sr.left - wr.left + wrap.scrollLeft + box.x * k + box.w * k / 2 - w / 2}px`;
  ta.style.top = `${sr.top - wr.top + wrap.scrollTop + box.y * k + box.h * k / 2 - h / 2}px`;
  ta.style.width = `${w}px`; ta.style.height = `${h}px`;
  ta.style.fontFamily = `'${family}', sans-serif`;
  ta.style.fontSize = `${Math.max(13, size * k)}px`;
  ta.value = text;
  ta.dataset.id = id;
  ta.hidden = false;
  ta.focus();
  ta.select();
}
function commitInlineEdit(cancel) {
  const ta = $('#inline-edit');
  if (ta.hidden) return;
  ta.hidden = true;
  const id = ta.dataset.id, val = ta.value.trim();
  if (cancel) return;
  if (id === 'title') {
    if (val === P().title) return;
    snapshot();
    P().title = val;
  } else {
    const it = itemOf(id);
    if (!it || val === it.text) return;
    snapshot();
    it.text = val || '…';
    resizeBubble(it, panelOf(id));
    delete state.ai[id];
  }
  renderStage(); renderGuide(); save();
}

// ── 스테이지 조작 ────────────────────────────────────────────────────
function svgPoint(evt) {
  const svg = $('#stage');
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function bindStage() {
  const svg = $('#stage');
  let drag = null;
  let resize = null;
  svg.addEventListener('pointerdown', (e) => {
    if (!$('#inline-edit').hidden) commitInlineEdit();
    const pt = svgPoint(e);
    const h = e.target.closest('.handle');
    if (h && state.selected?.kind === 'item') {
      const it = itemOf(state.selected.id);
      const box = it.type === 'character' ? characterBox(it, style()) : { x: it.x, y: it.y, w: it.w, h: it.h };
      resize = { id: it.id, corner: h.dataset.corner, box, size: it.size, moved: false };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const g = e.target.closest('.item');
    if (g && g.dataset.id === 'title') { state.selected = { kind: 'title', id: 'title' }; renderStage(); return; }
    if (g) {
      const it = itemOf(g.dataset.id);
      if (!it) return;
      state.selected = { kind: 'item', id: it.id };
      drag = { id: it.id, sx: pt.x, sy: pt.y, ox: it.x, oy: it.y, moved: false, snap: false };
      svg.setPointerCapture(e.pointerId);
      renderStage();
      highlightGuide(it.id);
      return;
    }
    const p = panelAt(pt.x, pt.y);
    state.selected = p ? { kind: 'panel', id: p.id } : null;
    renderStage();
  });
  svg.addEventListener('pointermove', (e) => {
    if (resize) {
      if (!resize.moved) { snapshot(); resize.moved = true; }
      resizeTo(resize, svgPoint(e), e.shiftKey);
      renderStage();
      $('#toolbar').hidden = true;
      return;
    }
    if (!drag) return;
    const pt = svgPoint(e);
    const dx = pt.x - drag.sx, dy = pt.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { snapshot(); drag.moved = true; $('#toolbar').hidden = true; }
    const it = itemOf(drag.id);
    it.x = Math.round(drag.ox + dx); it.y = Math.round(drag.oy + dy);
    const { inner } = renderProject({ ...P(), settings: state.settings }, { guides: state.guides });
    const target = panelAt(pt.x, pt.y);
    svg.innerHTML = inner + (target ? `<rect class="drop-hl" x="${target.x}" y="${target.y}" width="${target.w}" height="${target.h}"/>` : '');
  });
  const end = (e) => {
    if (resize) {
      const r = resize; resize = null;
      if (!r.moved) return;
      const it = itemOf(r.id);
      if (it.type === 'character') reflowBubbles(panelOf(r.id), style(), state.settings, measure);
      renderStage(); renderGuide(); save();
      toast(it.type === 'character' ? '인물 크기를 바꿨습니다.' : '말풍선 크기를 고정했습니다. 글은 안에 맞춰 줄바꿈합니다. (도구 막대의 "자동 크기"로 되돌림)');
      return;
    }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { renderStage(); return; }
    const pt = svgPoint(e);
    const it = itemOf(d.id);
    let from = panelOf(d.id);
    const to = panelAt(pt.x, pt.y) || from;
    if (to !== from) {
      from.items = from.items.filter((o) => o.id !== it.id);
      for (const o of from.items) if (o.tailTo === it.id) o.tailTo = null;
      to.items.push(it);
      if (it.type === 'bubble' && it.tailTo && !to.items.some((o) => o.id === it.tailTo)) it.tailTo = nearestCharacter(to, it.x, it.y)?.id || null;
    }
    if (it.type === 'character') {
      refineCharacter(to, it, to.items, style(), { keepSize: to === from, free: e.altKey, keepFlip: to === from });
      reflowBubbles(to, style(), state.settings, measure);
      toast(e.altKey ? '자유 위치로 놓았습니다.' : '바닥선에 세우고 겹치지 않게 맞췄습니다. (Alt 를 누른 채 놓으면 그대로 둡니다)');
    } else {
      if (to !== from) Object.assign(it, sizeBubble(it, to, state.settings, measure));
      if (!e.altKey) placeBubble(to, it, to.items, style(), { ideal: { x: it.x + it.w / 2, y: it.y + it.h / 2 }, pull: 2 });
    }
    renderStage(); renderGuide(); save();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('dblclick', (e) => {
    const g = e.target.closest('.item');
    if (g && (g.classList.contains('bubble') || g.dataset.id === 'title')) startInlineEdit(g.dataset.id);
  });

  // 재료 끌어 놓기
  svg.addEventListener('dragover', (e) => { e.preventDefault(); svg.classList.add('drop-ok'); e.dataTransfer.dropEffect = 'copy'; });
  svg.addEventListener('dragleave', () => svg.classList.remove('drop-ok'));
  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    svg.classList.remove('drop-ok');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain')); } catch { return; }
    const pt = svgPoint(e);
    const panel = panelAt(pt.x, pt.y);
    if (!panel) { toast('컷 안에 놓아 주세요.'); return; }
    const hitEl = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest('.item')).find(Boolean);
    applyMaterial(data, panel, pt, hitEl ? itemOf(hitEl.dataset.id) : null);
  });
}

// 재료를 컷에 적용한다. 놓은 자리를 기준으로 조금 다듬는다.
function applyMaterial({ kind, value }, panel, pt, hit) {
  snapshot();
  let msg = '';
  if (kind === 'character') {
    const ch = P().characters.find((c) => c.id === value);
    const count = panel.items.filter((o) => o.type === 'character').length;
    const it = { id: uid('i'), type: 'character', charId: ch.id, emotion: 'neutral', action: 'stand', x: pt.x, y: groundY(panel), size: defaultCharSize(panel, count + 1), flip: false };
    refineCharacter(panel, it, panel.items, style(), { keepSize: true });
    panel.items.push(it);
    reflowBubbles(panel, style(), state.settings, measure);
    state.selected = { kind: 'item', id: it.id };
    msg = `${ch.name}: 바닥선에 세우고 다른 인물과 겹치지 않게 놓았습니다.`;
  } else if (kind === 'emotion' || kind === 'action') {
    const target = hit && hit.type === 'character' ? hit : (hit && hit.tailTo ? itemOf(hit.tailTo) : nearestCharacter(panel, pt.x, pt.y));
    if (!target) { history.pop(); toast('이 컷에 인물이 없습니다. 먼저 캐릭터를 놓아 주세요.'); return; }
    target[kind] = value;
    if (kind === 'action') reflowBubbles(panel, style(), state.settings, measure);
    state.selected = { kind: 'item', id: target.id };
    const label = (kind === 'emotion' ? EMOTIONS : ACTIONS).find((x) => x.id === value).label;
    msg = `${charOf(target)?.name || '인물'}에게 '${label}'을(를) 적용했습니다.`;
  } else if (kind === 'bubble') {
    if (hit && hit.type === 'bubble') {
      hit.kind = value; delete hit.fontRole; resizeBubble(hit, panel);
      state.selected = { kind: 'item', id: hit.id };
      msg = '말풍선 모양을 바꿨습니다.';
    } else {
      const speaker = value === 'narration' ? null : (hit && hit.type === 'character' ? hit : nearestCharacter(panel, pt.x, pt.y));
      const b = { id: uid('i'), type: 'bubble', kind: value, text: value === 'narration' ? '내레이션을 입력하세요' : '대사를 입력하세요', tailTo: speaker ? speaker.id : null, x: pt.x, y: pt.y, w: 10, h: 10 };
      Object.assign(b, sizeBubble(b, panel, state.settings, measure));
      placeBubble(panel, b, panel.items, style(), { ideal: { x: pt.x, y: pt.y }, pull: 2 });
      panel.items.push(b);
      state.selected = { kind: 'item', id: b.id };
      renderStage(); renderGuide(); save();
      startInlineEdit(b.id);
      toast(speaker ? `${charOf(speaker)?.name}에게 꼬리를 달고 빈자리로 옮겼습니다. 바로 입력하세요.` : '빈자리에 놓았습니다. 바로 입력하세요.');
      return;
    }
  } else if (kind === 'font') {
    const b = hit && hit.type === 'bubble' ? hit : null;
    if (!b) { history.pop(); toast('폰트는 말풍선 위에 놓아 주세요.'); return; }
    b.fontRole = value; resizeBubble(b, panel);
    state.selected = { kind: 'item', id: b.id };
    msg = `말풍선에 ${FONT_ROLES.find((r) => r.id === value).label} 글꼴을 입혔습니다.`;
  } else if (kind === 'background') {
    const bg = BACKGROUNDS.find((x) => x.id === value);
    panel.background = { ...panel.background, kind: value, label: bg.label };
    state.selected = { kind: 'panel', id: panel.id };
    msg = `${P().panels.indexOf(panel) + 1}컷 배경을 '${bg.label}'(으)로 바꿨습니다.`;
  }
  renderStage(); renderGuide(); save();
  if (msg) toast(msg);
}

// 클릭으로 적용: 선택한 컷이나 인물에
function applyByClick(kind, value) {
  const s = state.selected;
  let panel = null, pt = null, hit = null;
  if (s && s.kind === 'item') { hit = itemOf(s.id); panel = panelOf(s.id); }
  else if (s && s.kind === 'panel') panel = P().panels.find((p) => p.id === s.id);
  if (!panel) { toast('먼저 캔버스에서 컷이나 인물을 선택하거나, 재료를 컷으로 끌어다 놓으세요.'); return; }
  if (kind === 'character' || (kind === 'bubble' && hit && hit.type !== 'bubble')) hit = kind === 'bubble' ? hit : null;
  pt = hit ? { x: hit.x + (hit.w ? hit.w / 2 : 0), y: hit.y - (hit.size ? hit.size * 0.7 : 0) } : { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
  applyMaterial({ kind, value }, panel, pt, hit);
}

function bindPalette() {
  const pal = $('.palette');
  pal.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const data = JSON.stringify({ kind: c.dataset.kind, value: c.dataset.value });
    e.dataTransfer.setData('application/json', data);
    e.dataTransfer.setData('text/plain', data);
    e.dataTransfer.effectAllowed = 'copy';
  });
  pal.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-char]');
    if (del) {
      const id = del.dataset.delChar;
      const used = P().panels.some((p) => p.items.some((i) => i.charId === id));
      if (used && del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = '삭제?'; toast('컷에 놓인 인물도 함께 지워집니다. 한 번 더 누르면 삭제합니다.'); return; }
      snapshot();
      P().characters = P().characters.filter((c) => c.id !== id);
      for (const p of P().panels) {
        const gone = p.items.filter((i) => i.charId === id).map((i) => i.id);
        p.items = p.items.filter((i) => i.charId !== id);
        for (const o of p.items) if (gone.includes(o.tailTo)) o.tailTo = null;
      }
      renderEdit(); save();
      return;
    }
    const c = e.target.closest('.chip');
    if (c) applyByClick(c.dataset.kind, c.dataset.value);
  });
  pal.addEventListener('keydown', (e) => {
    const c = e.target.closest('.chip');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyByClick(c.dataset.kind, c.dataset.value); }
  });
  $('#form-add-char').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#new-char-name').value.trim();
    if (!name) return;
    if (P().characters.some((c) => c.name === name)) { toast(`'${name}'은(는) 이미 있습니다.`); return; }
    snapshot();
    P().characters.push({ id: uid('c'), name, color: $('#new-char-color').value });
    $('#new-char-name').value = '';
    renderPalette(); save();
    toast(`${name}을(를) 추가했습니다. 컷으로 끌어다 놓으세요.`);
  });
}

// ── 대사 가이드 (맞춤법·사실 확인) ───────────────────────────────────
function diffHTML(a, b) {
  // 앞뒤 같은 부분을 빼고 가운데만 표시
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
    parts.push(`<div class="issue ${lvl}"><div class="row"><span class="tag">${lvl === 'fix' ? '맞춤법' : '맞춤법 · 뜻 확인'}</span><button class="small" data-apply="${b.id}" data-text="${esc(res.suggestion)}">적용</button></div>
      <div class="sugg">${diffHTML(b.text, res.suggestion)}</div>
      ${fixes.map((x) => `<div class="why">${esc(x.from)} → ${esc(x.to)}: ${esc(x.why)}</div>`).join('')}</div>`);
  }
  for (const f of res.issues.filter((x) => x.kind === 'fact')) {
    parts.push(`<div class="issue fact"><span class="tag">사실 확인 필요</span><div class="why">${esc(f.why)}</div></div>`);
  }
  const ai = state.ai[b.id];
  if (ai && ai.text === b.text) {
    const r = ai.result;
    const verdict = { ok: '사실과 맞음', doubtful: '의심스러움', false: '사실과 다름', unverifiable: '판단 근거 부족' }[r.factVerdict];
    const changed = r.suggestion && r.suggestion !== b.text;
    if (changed || verdict) {
      parts.push(`<div class="issue ai"><div class="row"><span class="tag">Claude 의견${verdict ? ` · ${verdict}` : ''}</span>${changed ? `<button class="small" data-apply="${b.id}" data-text="${esc(r.suggestion)}">적용</button>` : ''}</div>
        ${changed ? `<div class="sugg">${diffHTML(b.text, r.suggestion)}</div>` : ''}
        ${r.spellingNote ? `<div class="why">${esc(r.spellingNote)}</div>` : ''}${r.factNote ? `<div class="why">${esc(r.factNote)}</div>` : ''}</div>`);
    }
  }
  return { html: parts.join(''), nFix: fixes.length ? 1 : 0, nFact: res.issues.some((x) => x.kind === 'fact') ? 1 : 0 };
}

function renderGuide() {
  const list = $('#guide-list');
  let nFix = 0, nFact = 0, nLines = 0;
  const html = P().panels.map((p, i) => {
    const bubbles = p.items.filter((o) => o.type === 'bubble');
    const label = BACKGROUNDS.find((b) => b.id === p.background.kind)?.label;
    const rows = bubbles.map((b) => {
      nLines++;
      const sp = b.tailTo ? itemOf(b.tailTo) : null;
      const ch = sp ? charOf(sp) : null;
      const iss = issuesHTML(b);
      nFix += iss.nFix; nFact += iss.nFact;
      const kindLabel = BUBBLES.find((x) => x.id === b.kind)?.label;
      return `<div class="g-line ${state.selected?.id === b.id ? 'selected' : ''}" data-line="${b.id}">
        <div class="who">${ch ? `<span class="dot" style="background:${ch.color}"></span>${esc(ch.name)}` : '<span>—</span>'} · ${kindLabel}</div>
        <label class="sr-only" for="ta-${b.id}">${i + 1}컷 대사</label>
        <textarea id="ta-${b.id}" data-edit="${b.id}" rows="2">${esc(b.text)}</textarea>
        <div class="issues">${iss.html}</div></div>`;
    }).join('');
    return `<div class="g-panel"><h3><span>${i + 1}컷${label && p.background.kind !== 'none' ? ` · ${esc(label)}` : ''}</span></h3>${rows || '<div class="hint">대사 없음 · 말풍선을 끌어다 놓으세요</div>'}</div>`;
  }).join('');
  list.innerHTML = nLines ? html : '<div class="empty">대사가 아직 없습니다. 말풍선을 컷으로 끌어다 놓거나, 스크립트에서 가이드를 만드세요.</div>';
  $('#guide-summary').innerHTML = `<span>대사 <b>${nLines}</b>줄</span><span class="n-fix">맞춤법 고칠 곳 <b>${nFix}</b></span><span class="n-warn">사실 확인 <b>${nFact}</b></span>`;
}

function refreshLineIssues(id) {
  const card = $(`.g-line[data-line="${id}"] .issues`);
  const b = itemOf(id);
  if (card && b) card.innerHTML = issuesHTML(b).html;
}

function highlightGuide(id) {
  document.querySelectorAll('.g-line.selected').forEach((el) => el.classList.remove('selected'));
  const el = $(`.g-line[data-line="${id}"]`);
  if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function bindGuide() {
  const list = $('#guide-list');
  let typing = 0;
  list.addEventListener('focusin', (e) => {
    const id = e.target.dataset.edit;
    if (id) { snapshot(); state.selected = { kind: 'item', id }; renderStage(); highlightGuide(id); }
  });
  list.addEventListener('input', (e) => {
    const id = e.target.dataset.edit;
    if (!id) return;
    const b = itemOf(id);
    b.text = e.target.value;
    clearTimeout(typing);
    typing = setTimeout(() => { resizeBubble(b, panelOf(id)); renderStage(); refreshLineIssues(id); save(); }, 180);
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    const b = itemOf(btn.dataset.apply);
    snapshot();
    b.text = btn.dataset.text;
    resizeBubble(b, panelOf(b.id));
    renderStage(); renderGuide(); save();
    toast('권장 문장을 대사에 적용했습니다.');
  });
  $('#btn-check').addEventListener('click', () => {
    renderGuide();
    const t = $('#guide-summary').textContent;
    toast(`검사했습니다. ${t.replace(/\s+/g, ' ')}`);
  });
  $('#api-key').value = state.apiKey;
  $('#api-key').addEventListener('change', (e) => { state.apiKey = e.target.value.trim(); saveKey(); });
  $('#btn-ai').addEventListener('click', async () => {
    if (!state.apiKey) { $('#ai-settings').open = true; $('#api-key').focus(); toast('Claude 검사에는 Anthropic API 키가 필요합니다.'); return; }
    const lines = [];
    for (const p of P().panels) for (const b of p.items) if (b.type === 'bubble' && b.text.trim()) {
      const sp = b.tailTo ? itemOf(b.tailTo) : null;
      lines.push({ id: b.id, kind: b.kind, speaker: sp ? charOf(sp)?.name : '', text: b.text });
    }
    if (!lines.length) { toast('검사할 대사가 없습니다.'); return; }
    const btn = $('#btn-ai');
    btn.disabled = true; btn.textContent = 'Claude 검사 중…';
    try {
      const results = await aiCheck(state.apiKey, lines);
      for (const r of results) { const l = lines.find((x) => x.id === r.id); if (l) state.ai[r.id] = { text: l.text, result: r }; }
      renderGuide();
      toast(`Claude 가 대사 ${results.length}줄을 검사했습니다.`);
    } catch (err) {
      toast(describeError(err));
    } finally {
      btn.disabled = false; btn.textContent = 'Claude로 검사';
    }
  });
}

// ── 내보내기 ─────────────────────────────────────────────────────────
async function fontFaceCSS(families, text) {
  const chars = [...new Set(text)].join('');
  const css = [];
  for (const fam of families) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}&text=${encodeURIComponent(chars)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`글꼴 ${fam} 을(를) 받지 못했습니다.`);
    let rule = await res.text();
    const urls = [...rule.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    for (const u of urls) {
      const buf = await (await fetch(u)).arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      rule = rule.replace(u, `data:font/woff2;base64,${btoa(bin)}`);
    }
    css.push(rule);
  }
  return css.join('\n');
}

async function exportPNG() {
  const modal = $('#export-modal');
  modal.hidden = false;
  const status = $('#export-status');
  const img = $('#export-img');
  const link = $('#export-download');
  status.textContent = '이미지를 만드는 중…';
  img.removeAttribute('src');
  link.removeAttribute('href');
  const { width, height, inner } = renderProject({ ...P(), settings: state.settings }, { guides: false, background: $('#export-guides').checked });
  const used = new Set();
  let text = P().title || '';
  if (P().title && state.settings.showTitle) used.add(state.settings.fonts.title.family);
  for (const p of P().panels) for (const b of p.items) if (b.type === 'bubble') { used.add(state.settings.fonts[bubbleRole(b)].family); text += (b.lines || [b.text]).join(''); }
  let fontCSS = '', note = '';
  try { fontCSS = await fontFaceCSS([...used], text); } catch {
    note = ' 글꼴 파일을 받지 못해 이 기기의 기본 글꼴로 그렸습니다.';
  }
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>${fontCSS}</style></defs>${inner}</svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(im, 0, 0);
    URL.revokeObjectURL(svgUrl);
    c.toBlob((blob) => {
      const u = URL.createObjectURL(blob);
      img.src = u;
      link.href = u;
      link.download = `${(P().title || 'moatoon').replace(/[\\/:*?"<>|]/g, '')}.png`;
      status.textContent = `${width} × ${height}px PNG를 만들었습니다.${note}`;
    }, 'image/png');
  };
  im.onerror = () => { status.textContent = '이미지를 그리지 못했습니다. 다른 브라우저(Chrome, Edge)에서 다시 시도해 주세요.'; };
  im.src = svgUrl;
}

// ── 시작 ─────────────────────────────────────────────────────────────
function bindGlobal() {
  document.querySelectorAll('.steps button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-export').addEventListener('click', () => { if (!P()) generate(); exportPNG(); });
  $('#btn-close-export').addEventListener('click', () => { $('#export-modal').hidden = true; });
  $('#export-guides').addEventListener('change', exportPNG);
  $('#export-modal').addEventListener('click', (e) => { if (e.target.id === 'export-modal') e.target.hidden = true; });
  $('#toggle-guides').addEventListener('change', (e) => { state.guides = e.target.checked; renderStage(); save(); });
  $('#script-text').addEventListener('input', (e) => { state.script = e.target.value; renderScriptPreview(); save(); });
  $('#btn-sample').addEventListener('click', () => { state.script = SAMPLE; $('#script-text').value = SAMPLE; renderScriptPreview(); save(); });
  $('#btn-generate').addEventListener('click', () => {
    const res = generate();
    layoutDirty = false;
    setView('edit');
    toast(res.warnings[0] || `${res.panels.length}컷 배치 가이드를 만들었습니다. 재료를 끌어다 다듬어 보세요.`);
  });
  const ie = $('#inline-edit');
  ie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commitInlineEdit(); }
    if (e.key === 'Escape') commitInlineEdit(true);
  });
  ie.addEventListener('blur', () => commitInlineEdit());
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && state.selected?.kind === 'item' && state.view === 'edit') {
      e.preventDefault();
      snapshot();
      const p = panelOf(state.selected.id);
      p.items = p.items.filter((o) => o.id !== state.selected.id);
      for (const o of p.items) if (o.tailTo === state.selected.id) o.tailTo = null;
      state.selected = null;
      renderStage(); renderGuide(); save();
    }
    if (e.key === 'Escape' && !typing) { state.selected = null; renderStage(); }
  });
  window.addEventListener('resize', () => { if (state.view === 'edit') { fitStage(); positionToolbar(); } });
  $('#stage-wrap').addEventListener('scroll', positionToolbar);
}

function init() {
  const restored = load();
  loadKey();
  bindGlobal(); bindSetup(); bindStage(); bindToolbar(); bindPalette(); bindGuide();
  $('#script-text').value = state.script;
  $('#export-guides').checked = true;
  if (!restored) generate();
  setView(state.view);
  // 웹 글꼴이 다 내려오면 말풍선 크기를 실제 글꼴 폭으로 다시 잰다
  document.fonts.ready.then(() => {
    const fams = new Set(FONT_ROLES.map((r) => state.settings.fonts[r.id].family));
    return Promise.all([...fams].map((f) => document.fonts.load(`20px "${f}"`, '가나다')));
  }).then(() => {
    if (!P()) return;
    if (!restored) { generate(); } else resizeAllBubbles();
    if (state.view === 'edit') renderEdit();
  }).catch(() => {});
}

init();
// 디버깅·테스트용
window.__moatoon = { state, generate, renderEdit, applyMaterial };
