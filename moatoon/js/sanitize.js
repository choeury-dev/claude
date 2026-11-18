// 회차 파일(.moatoon.json)과 저장된 데이터를 열 때 값을 검사한다.
// 남이 만든 파일에 HTML·스크립트를 끼워 넣어도 화면에 들어가지 못하게, 모든 값을 정해진 모양으로만 받는다.
//  - 숫자는 숫자로, 색은 #rrggbb 로, ID 는 영문·숫자·_·- 만, 고르는 값은 목록 안에서만.
//  - 이미지는 data:image/(png|jpeg|gif|webp);base64 만 받는다.
//  - 글(이름, 대사)은 그대로 두되, 화면에 넣을 때 항상 이스케이프한다(render.js, main.js 의 esc).

import {
  EMOTIONS, ACTIONS, BUBBLES, FONT_ROLES, FONTS, BACKGROUNDS, LAYOUTS, SIZES, STYLES, TEXTURES,
  PAGE_KINDS, ANCHORS, PAGE_NUMBER_FORMATS, withDefaults, defaultSettings,
} from './catalog.js';
import { sanitizeGuide } from './ai.js';

const ID_RE = /^[\w-]{1,80}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const IMG_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const id = (v, d = null) => (typeof v === 'string' && ID_RE.test(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && HEX_RE.test(v) ? v : d);
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const pick = (v, list, d) => (list.includes(v) ? v : d);
const ids = (arr) => arr.map((x) => x.id);
const bool = (v) => v === true;
const BIG = 20000;

export function safeImageUrl(u) { return typeof u === 'string' && IMG_RE.test(u) ? u : ''; }

export function sanitizeAsset(a) {
  if (!a || typeof a !== 'object') return null;
  const url = safeImageUrl(a.url);
  const aid = id(a.id);
  if (!url || !aid) return null;
  const out = { id: aid, url, w: num(a.w, 1, BIG, 1), h: num(a.h, 1, BIG, 1), name: str(a.name, 200) };
  if (a.guide && typeof a.guide === 'object') out.guide = { ...sanitizeGuide(a.guide), source: a.guide.source === 'basic' ? 'basic' : 'claude' };
  return out;
}

function box(o) { return { x: num(o.x, -BIG, BIG, 0), y: num(o.y, -BIG, BIG, 0), w: num(o.w, 1, BIG, 10), h: num(o.h, 1, BIG, 10) }; }
function frac(o, d) { return o && typeof o === 'object' ? { x: num(o.x, 0, 1, d.x), y: num(o.y, 0, 1, d.y), w: num(o.w, 0.01, 1, d.w), h: num(o.h, 0.01, 1, d.h) } : undefined; }
function lines(v) { return Array.isArray(v) ? v.slice(0, 200).map((l) => str(l, 500)) : undefined; }

function sanitizeSettings(s) {
  const d = defaultSettings();
  const o = withDefaults(s && typeof s === 'object' ? s : null);
  const fonts = {};
  for (const r of FONT_ROLES) fonts[r.id] = { family: pick(o.fonts[r.id]?.family, FONTS, d.fonts[r.id].family), size: num(o.fonts[r.id]?.size, 8, 200, d.fonts[r.id].size) };
  const wm = o.watermark, pn = o.pageNumber;
  return {
    sizeId: pick(o.sizeId, ids(SIZES), 'custom'),
    width: num(o.width, 200, 6000, d.width), height: num(o.height, 200, 8000, d.height),
    layout: pick(o.layout, ids(LAYOUTS), 'auto'), style: pick(o.style, ids(STYLES), 'sd'), texture: pick(o.texture, ids(TEXTURES), 'clean'),
    margin: num(o.margin, 0, 400, d.margin), gutter: num(o.gutter, 0, 300, d.gutter), showTitle: bool(o.showTitle),
    panelsPerPage: num(o.panelsPerPage, 1, 12, d.panelsPerPage),
    fonts,
    watermark: {
      enabled: bool(wm.enabled), type: pick(wm.type, ['text', 'image'], 'text'), text: str(wm.text, 100), assetId: id(wm.assetId),
      anchor: pick(wm.anchor, ANCHORS, 'br'), dx: num(wm.dx, 0, 1000, 24), dy: num(wm.dy, 0, 1000, 14), size: num(wm.size, 6, 200, 20),
      opacity: num(wm.opacity, 0, 1, 0.55), color: hex(wm.color, '#1b1f2a'), skipCover: bool(wm.skipCover),
    },
    pageNumber: {
      enabled: bool(pn.enabled), format: pick(pn.format, ids(PAGE_NUMBER_FORMATS), 'n/total'),
      anchor: pick(pn.anchor, ANCHORS, 'bc'), dx: num(pn.dx, 0, 1000, 0), dy: num(pn.dy, 0, 1000, 14), size: num(pn.size, 6, 200, 20),
      opacity: num(pn.opacity, 0, 1, 0.8), color: hex(pn.color, '#1b1f2a'), skipCover: bool(pn.skipCover),
    },
    pageTemplates: {
      cover: id(o.pageTemplates.cover, 'builtin-cover'), content: id(o.pageTemplates.content, 'auto'), ending: id(o.pageTemplates.ending, 'builtin-ending'),
    },
    border: { texture: pick(o.border.texture, ids(TEXTURES), 'clean'), width: num(o.border.width, 0, 40, 4), color: hex(o.border.color, '#1b1f2a') },
  };
}

function sanitizeTransform(t) {
  t = t && typeof t === 'object' ? t : {};
  return {
    crop: pick(t.crop, ['full', 'bust', 'face'], 'full'), flip: bool(t.flip), rotate: num(t.rotate, -45, 45, 0),
    outline: bool(t.outline), shadow: bool(t.shadow), plate: pick(t.plate, ['none', 'circle', 'rounded'], 'none'), plateColor: hex(t.plateColor, '#ffe066'),
  };
}

function sanitizeItem(it) {
  if (!it || typeof it !== 'object' || !id(it.id)) return null;
  if (it.type === 'character') {
    const o = { id: it.id, type: 'character', charId: id(it.charId), emotion: pick(it.emotion, ids(EMOTIONS), 'neutral'), action: pick(it.action, ids(ACTIONS), 'stand'), x: num(it.x, -BIG, BIG, 0), y: num(it.y, -BIG, BIG, 0), size: num(it.size, 5, BIG, 100), flip: bool(it.flip) };
    if (!o.charId) return null;
    if (id(it.variantId)) o.variantId = it.variantId;
    if (it.aspect != null) o.aspect = num(it.aspect, 0.05, 20, 1);
    const h = frac(it.head, { x: 0.2, y: 0, w: 0.6, h: 0.35 });
    if (h) o.head = h;
    return o;
  }
  if (it.type === 'sticker') {
    if (!id(it.assetId)) return null;
    return { id: it.id, type: 'sticker', assetId: it.assetId, ...box(it), name: str(it.name, 40), charId: id(it.charId), versions: (Array.isArray(it.versions) ? it.versions : []).filter((v) => id(v)).slice(-20) };
  }
  if (it.type === 'region') {
    return { id: it.id, type: 'region', kind: pick(it.kind, ['character', 'bubble'], 'character'), name: str(it.name, 40), ...box(it) };
  }
  if (it.type === 'bubble') {
    const o = { id: it.id, type: 'bubble', kind: pick(it.kind, ids(BUBBLES), 'speech'), text: str(it.text), tailTo: id(it.tailTo), ...box(it) };
    if (it.fontRole) o.fontRole = pick(it.fontRole, ids(FONT_ROLES), 'dialogue');
    if (it.manual) o.manual = true;
    const l = lines(it.lines);
    if (l) o.lines = l;
    if (it.fontSize != null) o.fontSize = num(it.fontSize, 4, 300, 30);
    return o;
  }
  return null;
}

function sanitizeText(t) {
  if (!t || typeof t !== 'object' || !id(t.id)) return null;
  const o = {
    id: t.id, type: 'text', slot: id(t.slot, 'free'), role: pick(t.role, ids(FONT_ROLES), 'dialogue'), align: pick(t.align, ['left', 'center', 'right'], 'center'),
    box: bool(t.box), sizeScale: num(t.sizeScale, 0.1, 10, 1), color: hex(t.color, '#1b1f2a'), text: str(t.text), ...box(t),
  };
  const l = lines(t.lines);
  if (l) o.lines = l;
  if (t.fontSize != null) o.fontSize = num(t.fontSize, 4, 400, 30);
  return o;
}

function sanitizePanel(p) {
  if (!p || typeof p !== 'object' || !id(p.id)) return null;
  const bg = p.background && typeof p.background === 'object' ? p.background : {};
  const o = {
    id: p.id, ...box(p),
    background: { kind: pick(bg.kind, ids(BACKGROUNDS), 'none'), night: bool(bg.night), label: str(bg.label, 200) },
    note: str(p.note, 2000),
    items: (Array.isArray(p.items) ? p.items : []).map(sanitizeItem).filter(Boolean),
  };
  if (p.drop != null) o.drop = num(p.drop, -BIG, BIG, 0);
  if (id(p.bgImage)) o.bgImage = p.bgImage;
  if (p.noBorder) o.noBorder = true;
  if (p.imageEdit && typeof p.imageEdit === 'object' && id(p.imageEdit.original)) o.imageEdit = { original: p.imageEdit.original, ...(id(p.imageEdit.plate) ? { plate: p.imageEdit.plate } : {}) };
  if (p.zoom != null) o.zoom = num(p.zoom, 1, 5, 1);
  if (p.focus && typeof p.focus === 'object') o.focus = { x: num(p.focus.x, -BIG, BIG, 0), y: num(p.focus.y, -BIG, BIG, 0) };
  return o;
}

function sanitizeCharacter(c) {
  if (!c || typeof c !== 'object' || !id(c.id)) return null;
  return {
    id: c.id, name: str(c.name, 40), color: hex(c.color, '#868e96'),
    images: (Array.isArray(c.images) ? c.images : []).filter((v) => v && id(v.id) && id(v.assetId)).map((v) => {
      const o = { id: v.id, assetId: v.assetId, emotion: pick(v.emotion, ids(EMOTIONS), 'neutral'), transform: sanitizeTransform(v.transform), label: str(v.label, 80) };
      const fb = frac(v.faceBox, { x: 0.2, y: 0.02, w: 0.6, h: 0.4 });
      if (fb) o.faceBox = fb;
      return o;
    }),
  };
}

export function sanitizeProject(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    title: str(p.title, 200), episode: str(p.episode, 100),
    characters: (Array.isArray(p.characters) ? p.characters : []).map(sanitizeCharacter).filter(Boolean),
    pages: (Array.isArray(p.pages) ? p.pages : []).filter((pg) => pg && id(pg.id)).map((pg) => ({
      id: pg.id, kind: pick(pg.kind, ids(PAGE_KINDS), 'content'), templateId: id(pg.templateId, 'auto'),
      ...(pg.layoutId ? { layoutId: pick(pg.layoutId, ids(LAYOUTS), 'auto') } : {}),
      showTitle: bool(pg.showTitle),
      panels: (Array.isArray(pg.panels) ? pg.panels : []).map(sanitizePanel).filter(Boolean),
      texts: (Array.isArray(pg.texts) ? pg.texts : []).map(sanitizeText).filter(Boolean),
    })),
  };
}

export function sanitizeEpisode(ep) {
  ep = ep && typeof ep === 'object' ? ep : {};
  const src = ep.source && typeof ep.source === 'object' ? ep.source : {};
  return {
    id: id(ep.id, `ep_${Date.now().toString(36)}`), name: str(ep.name, 120), script: str(ep.script, 200000),
    settings: sanitizeSettings(ep.settings), project: sanitizeProject(ep.project),
    source: { type: pick(src.type, ['local', 'drive', 'drive-script'], 'local'), ...(id(src.fileId) ? { fileId: src.fileId } : {}), ...(id(src.folderId) ? { folderId: src.folderId } : {}), ...(id(src.scriptId) ? { scriptId: src.scriptId } : {}) },
    updated: num(ep.updated, 0, 1e14, Date.now()),
  };
}

// 레이아웃 파일(.json)을 올릴 때: 좌표는 0~1 비율, 고르는 값은 목록 안에서만
export function sanitizeTemplate(t, newId) {
  if (!t || typeof t !== 'object') return null;
  const fr = (r) => ({ x: num(r.x, 0, 1, 0), y: num(r.y, 0, 1, 0), w: num(r.w, 0.01, 1, 0.5), h: num(r.h, 0.01, 1, 0.5) });
  const panels = Array.isArray(t.panels) ? t.panels.slice(0, 24).filter((r) => r && typeof r === 'object').map(fr) : null;
  const texts = (Array.isArray(t.texts) ? t.texts.slice(0, 20) : []).filter((x) => x && typeof x === 'object').map((x) => ({
    slot: id(x.slot, 'free'), role: pick(x.role, ids(FONT_ROLES), 'dialogue'), align: pick(x.align, ['left', 'center', 'right'], 'center'),
    box: bool(x.box), sizeScale: num(x.sizeScale, 0.1, 10, 1), color: hex(x.color, '#1b1f2a'), ...fr(x), ...(x.text ? { text: str(x.text, 500) } : {}),
  }));
  if (!panels && !texts.length) return null;
  return { id: newId, name: str(t.name, 40) || '올린 레이아웃', kind: pick(t.kind, ids(PAGE_KINDS), 'content'), builtin: false, panels: panels && panels.length ? panels : [], texts };
}
