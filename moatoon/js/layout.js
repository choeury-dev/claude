// 컷 나누기, 인물 배치, 말풍선 배치, 드롭 후 다듬기.
// DOM을 쓰지 않는다. 글자 폭은 measure(text, fontFamily, size) 로 받는다.

import { LAYOUTS, BUBBLES, CHARACTER_COLORS } from './catalog.js';

let seq = 0;
export const uid = (p) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── 인물 형태(모든 그림체의 키는 200 단위, 발끝이 0) ───────────────────
export const FIGURE = {
  sd: { headY: -145, headR: 50, top: -195, halfW: 58 },
  stick: { headY: -172, headR: 26, top: -198, halfW: 50 },
  bean: { headY: -112, headR: 42, top: -168, halfW: 60 },
};

export function figureScale(item) { return item.size / 200; }

// 업로드한 캐릭터 이미지를 쓰는 인물: item.aspect(가로/세로)와 item.head(얼굴 위치, 비율)가 있다.
// item.size 는 이미지 높이, item.x 는 가운데, item.y 는 아래 끝이다.
export function characterBox(item, style) {
  if (item.aspect) {
    const w = item.size * item.aspect;
    return { x: item.x - w / 2, y: item.y - item.size, w, h: item.size };
  }
  const f = FIGURE[style] || FIGURE.sd;
  const s = figureScale(item);
  const lift = item.action === 'jump' ? 30 : item.action === 'sit' ? -28 : 0;
  const top = item.y + (f.top - lift) * s;
  return { x: item.x - f.halfW * s, y: top, w: f.halfW * 2 * s, h: item.y - top };
}

export function headBox(item, style) {
  if (item.aspect) {
    const b = characterBox(item, style);
    const h = item.head || { x: 0.2, y: 0, w: 0.6, h: 0.35 };
    const hx = item.flip ? 1 - h.x - h.w : h.x;
    const w = b.w * h.w, hh = b.h * h.h;
    const r = Math.min(w, hh) / 2;
    return { x: b.x + b.w * hx, y: b.y + b.h * h.y, w, h: hh, cx: b.x + b.w * (hx + h.w / 2), cy: b.y + b.h * (h.y + h.h / 2), r };
  }
  const f = FIGURE[style] || FIGURE.sd;
  const s = figureScale(item);
  const lift = item.action === 'jump' ? 30 : item.action === 'sit' ? -28 : 0;
  const cy = item.y + (f.headY - lift) * s;
  const r = f.headR * s;
  return { x: item.x - r, y: cy - r, w: r * 2, h: r * 2, cx: item.x, cy, r };
}

// ── 컷 나누기 ─────────────────────────────────────────────────────────
export function autoLayout(n, settings) {
  const tall = settings.height / settings.width;
  if (n <= 1) return 'v3';
  if (n <= 3) return 'v3';
  if (n === 4) return tall > 1.5 ? 'v4' : 'g4';
  if (n === 5) return 'm5';
  if (n === 6) return 'g6';
  return 'g9';
}

export function layoutRows(layoutId, n) {
  if (layoutId === 'v3' && n && n < 3) return Array.from({ length: n }, () => [1]);
  const l = LAYOUTS.find((x) => x.id === layoutId) || LAYOUTS[2];
  return l.rows || [[1], [1], [1]];
}

export function titleHeight(settings, hasTitle) {
  return hasTitle && settings.showTitle ? Math.round(settings.fonts.title.size * 1.9) : 0;
}

// 주어진 영역(area)을 줄마다 칸 수(rows: [[1],[1,1]] 꼴)로 나눈다
export function rectsInArea(area, rows, gutter) {
  const rects = [];
  const rowH = (area.h - gutter * (rows.length - 1)) / rows.length;
  let y = area.y;
  for (const row of rows) {
    const total = row.reduce((a, b) => a + b, 0);
    const innerW = area.w - gutter * (row.length - 1);
    let x = area.x;
    for (const wgt of row) { const w = (innerW * wgt) / total; rects.push({ x, y, w, h: rowH }); x += w + gutter; }
    y += rowH + gutter;
  }
  return rects;
}

export function computePanels(settings, layoutId, hasTitle, n) {
  const rows = layoutRows(layoutId, n);
  const { width: W, height: H, margin: m, gutter: g } = settings;
  const top = m + titleHeight(settings, hasTitle);
  const innerH = H - top - m - g * (rows.length - 1);
  const rects = [];
  let y = top;
  const rowH = innerH / rows.length;
  for (const row of rows) {
    const total = row.reduce((a, b) => a + b, 0);
    const innerW = W - m * 2 - g * (row.length - 1);
    let x = m;
    for (const wgt of row) {
      const w = (innerW * wgt) / total;
      rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(rowH) });
      x += w + g;
    }
    y += rowH + g;
  }
  return rects;
}

// ── 말풍선 크기 ───────────────────────────────────────────────────────
export function bubbleRole(item) {
  return item.fontRole || (BUBBLES.find((b) => b.id === item.kind) || BUBBLES[0]).role;
}

export function wrapText(text, maxW, font, size, measure) {
  const out = [];
  for (const para of String(text || ' ').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const trial = line + w;
      if (!line || measure(trial.trimEnd(), font, size) <= maxW) { line = trial; continue; }
      out.push(line.trim());
      line = w.trimStart();
      // 한 낱말이 한 줄보다 길면 글자 단위로 자른다
      while (measure(line, font, size) > maxW && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && measure(line.slice(0, k), font, size) > maxW) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trim());
  }
  return out.length ? out : [''];
}

// 말풍선 바깥 크기(w, h) 안에서 글자가 들어갈 수 있는 넓이
function textArea(kind, w, h, size) {
  if (kind === 'narration') return { tw: w - size * 1.2, th: h - size * 0.9 };
  if (kind === 'thought') return { tw: (w - 24) * 0.68, th: (h - 20) * 0.62 };
  if (kind === 'shout') return { tw: (w - 30) * 0.66, th: (h - 28) * 0.6 };
  return { tw: (w - 14) * 0.74, th: (h - 12) * 0.7 };
}

export const MIN_BUBBLE = { w: 60, h: 40 };

// 사용자가 모서리를 끌어 크기를 정한 말풍선: 크기는 그대로 두고 글을 그 안에 맞춰 줄바꿈한다.
// 글이 넘치면 글자 크기만 줄인다(기본 크기보다 키우지는 않는다).
function fitInBox(item, font, base, measure) {
  const w = Math.max(MIN_BUBBLE.w, item.w), h = Math.max(MIN_BUBBLE.h, item.h);
  let size = base, lines;
  for (let tries = 0; tries < 24; tries++) {
    const { tw, th } = textArea(item.kind, w, h, size);
    lines = wrapText(item.text, Math.max(size, tw), font.family, size, measure);
    const widest = Math.max(0, ...lines.map((l) => measure(l, font.family, size)));
    if ((lines.length * size * 1.3 <= th && widest <= tw + 1) || size <= 10) break;
    size = Math.max(10, size * 0.92);
  }
  return { w: Math.round(w), h: Math.round(h), lines, fontSize: size };
}

export function sizeBubble(item, panel, settings, measure) {
  const font = settings.fonts[bubbleRole(item)];
  let size = font.size * (item.kind === 'shout' ? 1.15 : item.kind === 'whisper' ? 0.9 : 1);
  if (item.manual && item.w && item.h) return fitInBox(item, font, size, measure);
  const maxTextW = Math.min(panel.w * (item.kind === 'narration' || item.kind === 'caption' ? 0.8 : 0.55), size * (item.kind === 'caption' ? 16 : 11));
  let lines, textW, textH;
  for (let tries = 0; tries < 6; tries++) {
    lines = wrapText(item.text, maxTextW, font.family, size, measure);
    textW = Math.max(size * 2, ...lines.map((l) => measure(l, font.family, size)));
    textH = lines.length * size * 1.3;
    const h = item.kind === 'narration' ? textH + size : textH / 0.68 + 12;
    if (h <= panel.h * 0.7) break;
    size *= 0.88; // 컷보다 크면 글자를 조금 줄인다
  }
  let w, h;
  if (item.kind === 'narration' || item.kind === 'caption') { w = textW + size * 1.2; h = textH + size * 0.9; }
  else if (item.kind === 'thought') { w = textW / 0.68 + 24; h = textH / 0.62 + 20; }
  else if (item.kind === 'shout') { w = textW / 0.66 + 30; h = textH / 0.6 + 28; }
  else { w = textW / 0.74 + 14; h = textH / 0.7 + 12; }
  return { w: Math.round(Math.min(w, panel.w - 16)), h: Math.round(Math.min(h, panel.h - 16)), lines, fontSize: size };
}

// ── 겹침 계산 ────────────────────────────────────────────────────────
function overlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 말풍선 하나를 컷 안의 빈자리로 옮긴다.
// ideal: 원하는 중심점(드롭 위치 등). pull: ideal 에 끌리는 정도.
export function placeBubble(panel, bubble, others, style, opts = {}) {
  const pad = 8;
  const speaker = others.find((o) => o.id === bubble.tailTo && o.type === 'character');
  const head = speaker ? headBox(speaker, style) : null;
  let ideal = opts.ideal;
  if (!ideal) {
    if (bubble.kind === 'narration') ideal = { x: panel.x + bubble.w / 2 + pad, y: panel.y + bubble.h / 2 + pad };
    else if (bubble.kind === 'caption') ideal = { x: panel.x + panel.w / 2, y: (opts.prev ? opts.prev.y + opts.prev.h + bubble.h / 2 + 10 : panel.y + panel.h * 0.3) };
    else if (head) {
      // 위에서부터 대사 순서대로 쌓는다: 첫 대사는 컷 위쪽, 다음 대사는 앞 대사 조금 아래
      const top = opts.prev ? opts.prev.y + opts.prev.h * 0.55 : panel.y + pad;
      ideal = { x: head.cx, y: Math.min(head.y - bubble.h / 2 - 14, top + bubble.h / 2) };
    }
    else ideal = { x: panel.x + panel.w / 2, y: panel.y + bubble.h / 2 + pad };
  }
  const pull = opts.pull ?? 1;
  const minX = panel.x + pad, maxX = panel.x + panel.w - bubble.w - pad;
  const minY = panel.y + pad, maxY = panel.y + panel.h - bubble.h - pad;
  const prev = opts.prev; // 바로 앞 말풍선(읽는 순서)
  const area = bubble.w * bubble.h;
  const diag = Math.hypot(panel.w, panel.h);
  let best = null;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = maxX <= minX ? (minX + maxX) / 2 : minX + ((maxX - minX) * i) / steps;
      const y = maxY <= minY ? (minY + maxY) / 2 : minY + ((maxY - minY) * j) / steps;
      const box = { x, y, w: bubble.w, h: bubble.h };
      let cost = 0;
      for (const o of others) {
        if (o.id === bubble.id) continue;
        if (o.type === 'bubble') cost += (overlap(box, o) / Math.min(area, o.w * o.h)) * 150; // 말풍선끼리는 겹치지 않게
        if (o.type === 'character') {
          const hb = headBox(o, style);
          cost += (overlap(box, hb) / (hb.w * hb.h)) * 25; // 얼굴은 가리지 않는다
          cost += (overlap(box, characterBox(o, style)) / area) * 10;
        }
      }
      const cx = x + bubble.w / 2, cy = y + bubble.h / 2;
      cost += (Math.hypot(cx - ideal.x, cy - ideal.y) / diag) * 12 * pull;
      if (head && cy > head.cy) cost += 2; // 말풍선은 머리보다 위가 좋다
      if (prev) {
        const pcx = prev.x + prev.w / 2;
        // 뒤 대사는 앞 대사보다 아래(또는 같은 높이의 오른쪽)에 둬야 읽는 순서가 맞다
        if (y < prev.y - 4) cost += 30 + (prev.y - y) / 20;
        else if (cx < pcx && y < prev.y + prev.h * 0.5) cost += 4;
      }
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  bubble.x = Math.round(best.x);
  bubble.y = Math.round(best.y);
  return bubble;
}

// ── 인물 다듬기 ──────────────────────────────────────────────────────
// panel.drop: 대사가 많은 컷은 인물을 아래로 내려 무릎 위만 보이게(바스트 샷) 한다
export function groundY(panel) { return panel.y + panel.h * 0.97 + (panel.drop || 0); }

export function defaultCharSize(panel, count) {
  const byH = panel.h * 0.58;
  const byW = (panel.w / Math.max(1, count)) * 1.25;
  return Math.round(Math.max(60, Math.min(byH, byW)));
}

// 드롭한 위치 근처에서 다른 인물과 겹치지 않는 자리를 찾고, 바닥선에 세운다.
export function refineCharacter(panel, item, items, style, opts = {}) {
  const chars = items.filter((o) => o.type === 'character' && o.id !== item.id);
  if (!opts.keepSize) item.size = defaultCharSize(panel, chars.length + 1);
  if (!opts.free) item.y = Math.round(groundY(panel));
  const half = characterBox(item, style).w / 2;
  const lo = panel.x + half * 0.9, hi = panel.x + panel.w - half * 0.9;
  const want = clamp(item.x, lo, hi);
  const gap = half * 1.7;
  let bestX = want, bestCost = Infinity;
  for (let k = 0; k <= 40; k++) {
    const x = lo + ((hi - lo) * k) / 40;
    let cost = Math.abs(x - want) / panel.w;
    for (const c of chars) if (Math.abs(c.x - x) < gap) cost += 5 * (1 - Math.abs(c.x - x) / gap);
    if (cost < bestCost) { bestCost = cost; bestX = x; }
  }
  if (Math.abs(want - bestX) < 2) bestX = want;
  item.x = Math.round(bestX);
  if (!opts.keepFlip) item.flip = item.x > panel.x + panel.w / 2;
  return item;
}

// 인물이 바뀐 뒤, 머리를 가리는 말풍선만 다시 놓는다.
export function reflowBubbles(panel, style, settings, measure, onlyOverlapping = true) {
  let prev = null;
  for (const b of panel.items.filter((o) => o.type === 'bubble')) {
    const covers = panel.items.some((o) => o.type === 'character' && overlap(b, headBox(o, style)) > 0);
    const outside = b.x < panel.x || b.y < panel.y || b.x + b.w > panel.x + panel.w || b.y + b.h > panel.y + panel.h;
    if (!onlyOverlapping || covers || outside) {
      Object.assign(b, sizeBubble(b, panel, settings, measure));
      placeBubble(panel, b, panel.items, style, { prev, ideal: onlyOverlapping ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined, pull: onlyOverlapping ? 0.6 : 1 });
    }
    prev = b;
  }
}

export function nearestCharacter(panel, x, y) {
  let best = null, bd = Infinity;
  for (const o of panel.items) {
    if (o.type !== 'character') continue;
    const d = Math.abs(o.x - x) + Math.abs(o.y - o.size * 0.7 - y) * 0.5;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ── 스크립트 → 가이드 ─────────────────────────────────────────────────
export function mergeCharacters(existing, names) {
  const list = existing.map((c) => ({ ...c }));
  for (const name of names) {
    if (list.some((c) => c.name === name)) continue;
    list.push({ id: uid('c'), name, color: CHARACTER_COLORS[list.length % CHARACTER_COLORS.length] });
  }
  return list;
}

// 장면 하나를 컷 하나에 채운다: 인물 배치 → 말풍선 배치.
// prepareItem(item): 업로드 이미지가 있는 캐릭터면 aspect/head 를 채우는 함수(없어도 됨).
export function fillPanel(panel, scene, characters, settings, measure, prepareItem) {
  panel.background = { ...scene.background };
  panel.note = [scene.desc, ...scene.notes].filter(Boolean).join(' / ');
  const cast = scene.cast;
  const size = defaultCharSize(panel, cast.length);
  // 말풍선이 차지할 넓이를 미리 재 보고, 많으면 인물을 내려서 위쪽 공간을 비운다
  const bubbleArea = scene.lines.reduce((a, l) => {
    const t = sizeBubble({ kind: l.kind, text: l.text }, panel, settings, measure);
    return a + t.w * t.h;
  }, 0);
  const crowd = bubbleArea / (panel.w * panel.h);
  if (cast.length && crowd > 0.18) panel.drop = Math.round(size * Math.min(0.42, (crowd - 0.1) * 1.2));
  cast.forEach((m, k) => {
    const ch = characters.find((c) => c.name === m.name);
    const x = panel.x + (panel.w * (k + 1)) / (cast.length + 1);
    const item = { id: uid('i'), type: 'character', charId: ch.id, emotion: m.emotion || 'neutral', action: m.action || 'stand', x, y: groundY(panel), size, flip: false };
    item.flip = cast.length > 1 && x > panel.x + panel.w / 2;
    if (prepareItem) prepareItem(item);
    panel.items.push(item);
  });
  let prev = null;
  for (const line of scene.lines) {
    const speakerChar = line.speaker && characters.find((c) => c.name === line.speaker);
    const target = speakerChar && panel.items.find((o) => o.type === 'character' && o.charId === speakerChar.id);
    const b = { id: uid('i'), type: 'bubble', kind: line.kind, text: line.text, tailTo: target ? target.id : null, x: panel.x, y: panel.y, w: 10, h: 10 };
    Object.assign(b, sizeBubble(b, panel, settings, measure));
    placeBubble(panel, b, panel.items, settings.style, { prev });
    panel.items.push(b);
    prev = b;
  }
  return panel;
}

// 페이지에 놓이는 글 상자(표지 제목, 요약 등). 상자 안에 줄바꿈하고 넘치면 글자를 줄인다.
export function layoutText(item, settings, measure) {
  const font = settings.fonts[item.role] || settings.fonts.dialogue;
  const base = font.size * (item.sizeScale || 1);
  const padX = item.box ? base * 0.8 : 4, padY = item.box ? base * 0.7 : 2;
  // 요약 목록: "1. …"은 번호 그대로, 들여 쓴 줄은 설명(기호 없음), 나머지는 • 를 붙인다
  const paras = String(item.text || '').split('\n').map((t) => {
    if (item.slot !== 'summary' || !t.trim()) return t;
    if (/^\d+[.)]\s/.test(t) || /^\s/.test(t)) return t.trim();
    return `• ${t.replace(/^[-•]\s*/, '')}`;
  });
  let size = base, lines = [];
  for (let tries = 0; tries < 30; tries++) {
    lines = [];
    for (const p of paras) lines.push(...wrapText(p, Math.max(size, item.w - padX * 2), font.family, size, measure));
    const lh = size * (item.slot === 'summary' ? 1.6 : 1.3);
    if (lines.length * lh <= item.h - padY * 2 || size <= 10) break;
    size = Math.max(10, size * 0.93);
  }
  return { lines, fontSize: size };
}

// 클로즈업: 인물 얼굴을 기준점으로 컷 안의 인물(과 배경)을 z배 키운다. 말풍선 글자는 그대로.
export function zoomPanel(panel, z, style) {
  const heads = panel.items.filter((i) => i.type === 'character').map((c) => headBox(c, style));
  if (!heads.length || z <= 1) return;
  const f = { x: heads.reduce((a, h) => a + h.cx, 0) / heads.length, y: heads.reduce((a, h) => a + h.cy, 0) / heads.length };
  // 얼굴이 컷 위쪽 1/3 쯤에 오도록 기준점을 잡는다
  panel.focus = f;
  for (const it of panel.items) {
    if (it.type !== 'character') continue;
    it.x = f.x + (it.x - f.x) * z;
    it.y = f.y + (it.y - f.y) * z + (panel.y + panel.h * 0.4 - f.y);
    it.size *= z;
  }
  panel.focus = { x: f.x, y: panel.y + panel.h * 0.4 };
  panel.zoom = Math.round(z * 100) / 100;
}

export function generateProject(parsed, settings, existingChars, measure) {
  const characters = mergeCharacters(existingChars || [], parsed.characters);
  const n = Math.max(1, parsed.scenes.length);
  const layoutId = settings.layout === 'auto' ? autoLayout(n, settings) : settings.layout;
  const rects = computePanels(settings, layoutId, !!parsed.title, settings.layout === 'auto' ? n : undefined);
  const warnings = [...parsed.warnings];
  if (parsed.scenes.length > rects.length) {
    warnings.push(`장면이 ${parsed.scenes.length}개인데 컷은 ${rects.length}개입니다. 뒤의 ${parsed.scenes.length - rects.length}개 장면은 넣지 않았습니다. 레이아웃을 '장면 수에 맞춤'으로 바꾸면 모두 들어갑니다.`);
  }
  const panels = rects.map((r, i) => {
    const panel = { id: uid('p'), ...r, background: { kind: 'none', night: false, label: '' }, note: '', items: [] };
    if (parsed.scenes[i]) fillPanel(panel, parsed.scenes[i], characters, settings, measure);
    return panel;
  });
  return { title: parsed.title, characters, panels, layoutId, warnings };
}
