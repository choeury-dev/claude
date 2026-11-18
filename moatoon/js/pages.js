// 회차 하나 = 여러 페이지(표지 → 내용 → 마지막 요약).
// 페이지 레이아웃(템플릿)은 페이지 크기에 대한 비율(0~1)로 저장해서 캔버스 크기가 바뀌어도 쓸 수 있다.

import { BUILTIN_TEMPLATES } from './catalog.js';
import {
  uid, autoLayout, computePanels, layoutRows, fillPanel, mergeCharacters, layoutText,
  sizeBubble, placeBubble, defaultCharSize, groundY, refineCharacter,
} from './layout.js';

export function allTemplates(user = []) { return [...BUILTIN_TEMPLATES, ...user]; }
export function findTemplate(id, user = []) { return allTemplates(user).find((t) => t.id === id); }

const denorm = (r, W, H) => ({ x: Math.round(r.x * W), y: Math.round(r.y * H), w: Math.round(r.w * W), h: Math.round(r.h * H) });
const norm = (r, W, H) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });

const emptyPanel = (r) => ({ id: uid('p'), ...r, background: { kind: 'none', night: false, label: '' }, note: '', items: [] });

function slotText(slot, parsed) {
  switch (slot) {
    case 'title': return parsed.title || '제목';
    case 'episode': return parsed.episode || '';
    case 'subtitle': return parsed.subtitle || '';
    case 'heading': return '오늘의 정리';
    case 'summary': return parsed.summary.length ? parsed.summary.join('\n') : '요약을 입력하세요';
    default: return '';
  }
}

export function makeText(t, W, H, text, settings, measure) {
  const item = { id: uid('t'), type: 'text', slot: t.slot || 'free', role: t.role || 'dialogue', align: t.align || 'center', box: !!t.box, sizeScale: t.sizeScale || 1, color: t.color || '#1b1f2a', ...denorm(t, W, H), text };
  Object.assign(item, layoutText(item, settings, measure));
  return item;
}

function contentRects(settings, n, tpl, hasTitle) {
  if (tpl && tpl.panels) return tpl.panels.map((r) => denorm(r, settings.width, settings.height));
  const layoutId = settings.layout === 'auto' ? autoLayout(n, settings) : settings.layout;
  return computePanels(settings, layoutId, hasTitle, settings.layout === 'auto' ? n : undefined);
}

export function perPage(settings, tpl) {
  if (tpl && tpl.panels) return tpl.panels.length;
  if (settings.layout === 'auto') return Math.max(1, settings.panelsPerPage || 4);
  return layoutRows(settings.layout).flat().length;
}

// 스크립트(parsed)로 페이지들을 만든다.
export function buildPages(parsed, settings, userTemplates, existingChars, measure, prepareItem) {
  const W = settings.width, H = settings.height;
  const characters = mergeCharacters(existingChars || [], parsed.characters);
  const tplOf = (kind) => findTemplate(settings.pageTemplates[kind], userTemplates) || BUILTIN_TEMPLATES.find((t) => t.kind === kind);
  const pages = [];
  const textsFor = (tpl) => (tpl.texts || []).map((t) => makeText(t, W, H, t.slot === 'free' ? t.text || '' : slotText(t.slot, parsed), settings, measure)).filter((t) => t.text || t.slot === 'free');

  // 표지: 제목이 있을 때만
  if (parsed.title) {
    const tpl = tplOf('cover');
    const page = { id: uid('pg'), kind: 'cover', templateId: tpl.id, panels: (tpl.panels || []).map((r) => emptyPanel(denorm(r, W, H))), texts: textsFor(tpl) };
    // 표지 컷에는 주요 인물(앞의 두 명)을 웃는 얼굴로 세운다
    const main = characters.filter((c) => parsed.characters.includes(c.name)).slice(0, 2);
    if (page.panels[0] && main.length) {
      fillPanel(page.panels[0], { background: { kind: 'none', night: false, label: '' }, desc: '표지', notes: [], lines: [], cast: main.map((c, i) => ({ name: c.name, emotion: 'happy', action: i === 0 ? 'wave' : 'stand' })) }, characters, settings, measure, prepareItem);
    }
    pages.push(page);
  }

  // 내용: 장면을 페이지당 컷 수만큼 나눈다
  const tpl = tplOf('content');
  const per = perPage(settings, tpl);
  const scenes = parsed.scenes.length ? parsed.scenes : [null];
  for (let i = 0; i < scenes.length; i += per) {
    const chunk = scenes.slice(i, i + per).filter(Boolean);
    const hasTitle = !parsed.title ? false : settings.showTitle && i === 0;
    const rects = contentRects(settings, Math.max(1, chunk.length), tpl, hasTitle);
    const page = { id: uid('pg'), kind: 'content', templateId: tpl.id, layoutId: settings.layout, panels: rects.map(emptyPanel), texts: textsFor(tpl), showTitle: hasTitle };
    page.panels.forEach((p, k) => { if (chunk[k]) fillPanel(p, chunk[k], characters, settings, measure, prepareItem); });
    pages.push(page);
  }

  // 마지막(요약): 요약 줄이 있을 때만
  if (parsed.summary.length || parsed.closing) {
    const etpl = tplOf('ending');
    const page = { id: uid('pg'), kind: 'ending', templateId: etpl.id, panels: (etpl.panels || []).map((r) => emptyPanel(denorm(r, W, H))), texts: textsFor(etpl) };
    const first = characters.find((c) => parsed.characters.includes(c.name));
    if (page.panels[0] && first) {
      fillPanel(page.panels[0], {
        background: { kind: 'none', night: false, label: '' }, desc: '마무리', notes: [],
        lines: parsed.closing ? [{ kind: 'speech', speaker: first.name, text: parsed.closing }] : [],
        cast: [{ name: first.name, emotion: 'happy', action: 'wave' }],
      }, characters, settings, measure, prepareItem);
    }
    pages.push(page);
  }
  return { title: parsed.title, episode: parsed.episode, characters, pages, warnings: [...parsed.warnings] };
}

// 지금 페이지를 레이아웃으로 저장: 컷 위치와 글 상자 위치만 남기고 내용은 뺀다(자유 글은 문구도 남김).
export function templateFromPage(page, settings, name, kind) {
  const W = settings.width, H = settings.height;
  return {
    id: uid('tpl'), name, kind, builtin: false,
    panels: page.panels.map((p) => norm(p, W, H)),
    texts: page.texts.map((t) => ({ slot: t.slot, role: t.role, align: t.align, box: t.box, sizeScale: t.sizeScale, color: t.color, ...norm(t, W, H), ...(t.slot === 'free' ? { text: t.text } : {}) })),
  };
}

// 컷 배치를 바꾼다(레이아웃 적용). 원래 컷의 인물·말풍선은 같은 순서의 새 컷으로 비율을 맞춰 옮긴다.
export function applyRects(page, rects, settings, measure) {
  const old = page.panels;
  const dropped = Math.max(0, old.length - rects.length);
  page.panels = rects.map((r, i) => {
    const o = old[i];
    if (!o) return emptyPanel(r);
    const sx = r.w / o.w, sy = r.h / o.h, s = Math.min(sx, sy);
    const panel = { ...o, ...r, drop: o.drop ? o.drop * s : 0 };
    if (o.focus) panel.focus = { x: r.x + (o.focus.x - o.x) * sx, y: r.y + (o.focus.y - o.y) * sy };
    panel.items = o.items.map((it) => {
      const n = { ...it };
      if (it.type === 'character') {
        n.x = r.x + (it.x - o.x) * sx;
        n.size = Math.max(30, it.size * s);
        n.y = groundY(panel);
      } else {
        n.x = r.x + (it.x - o.x) * sx;
        n.y = r.y + (it.y - o.y) * sy;
      }
      return n;
    });
    for (const it of panel.items) if (it.type === 'character') refineCharacter(panel, it, panel.items, settings.style, { keepSize: true, keepFlip: true });
    let prev = null;
    for (const b of panel.items.filter((x) => x.type === 'bubble')) {
      if (b.manual) { b.w = Math.min(b.w, panel.w - 16); b.h = Math.min(b.h, panel.h - 16); }
      Object.assign(b, sizeBubble(b, panel, settings, measure));
      placeBubble(panel, b, panel.items, settings.style, { prev, ideal: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, pull: 1.5 });
      prev = b;
    }
    return panel;
  });
  return dropped;
}

export function applyTemplate(page, tpl, settings, measure) {
  const W = settings.width, H = settings.height;
  let dropped = 0;
  if (tpl.panels) dropped = applyRects(page, tpl.panels.map((r) => denorm(r, W, H)), settings, measure);
  else if (page.kind === 'content') dropped = applyRects(page, contentRects(settings, page.panels.length || 1, null, false), settings, measure);
  const oldTexts = page.texts || [];
  page.texts = (tpl.texts || []).map((t) => {
    const prev = oldTexts.find((o) => o.slot === t.slot && t.slot !== 'free');
    return makeText(t, W, H, prev ? prev.text : (t.text || slotText(t.slot, { title: '', summary: [] })), settings, measure);
  });
  page.templateId = tpl.id;
  return dropped;
}

// 빈 페이지 하나 만들기 (페이지 추가)
export function blankPage(kind, settings, userTemplates, measure, parsedLike = { title: '', summary: [] }) {
  const W = settings.width, H = settings.height;
  const tpl = findTemplate(settings.pageTemplates[kind], userTemplates) || BUILTIN_TEMPLATES.find((t) => t.kind === kind);
  const rects = tpl.panels ? tpl.panels.map((r) => denorm(r, W, H)) : contentRects(settings, perPage(settings, null), null, false);
  return {
    id: uid('pg'), kind, templateId: tpl.id, panels: rects.map(emptyPanel),
    texts: (tpl.texts || []).map((t) => makeText(t, W, H, t.text || slotText(t.slot, parsedLike), settings, measure)),
  };
}

// 예전(한 페이지) 저장본을 여러 페이지 형식으로 바꾼다.
export function migrateProject(p) {
  if (p.pages) return p;
  return { title: p.title || '', episode: '', characters: p.characters || [], pages: [{ id: uid('pg'), kind: 'content', templateId: 'auto', panels: p.panels || [], texts: [], showTitle: !!p.title }] };
}

export { defaultCharSize, groundY };
