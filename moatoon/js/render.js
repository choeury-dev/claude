// 프로젝트를 SVG 문자열로 그린다. 편집 화면과 이미지 내보내기가 같은 함수를 쓴다.

import { FIGURE, figureScale, headBox, characterBox, bubbleRole, titleHeight } from './layout.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Math.round(n * 10) / 10;

// ── 얼굴 ──────────────────────────────────────────────────────────────
export function face(cx, cy, r, emotion, ink = '#1b1f2a') {
  const ex = r * 0.36, ey = cy - r * 0.05, er = Math.max(1.6, r * 0.075), sw = Math.max(1.4, r * 0.07);
  const my = cy + r * 0.42, mw = r * 0.28;
  const L = cx - ex, R = cx + ex;
  const st = `stroke="${ink}" stroke-width="${f1(sw)}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const dot = (x, y, rr = er) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${ink}"/>`;
  const blush = () => `<ellipse cx="${f1(L - r * 0.12)}" cy="${f1(cy + r * 0.25)}" rx="${f1(r * 0.14)}" ry="${f1(r * 0.07)}" fill="#ff8fa3" opacity=".7"/><ellipse cx="${f1(R + r * 0.12)}" cy="${f1(cy + r * 0.25)}" rx="${f1(r * 0.14)}" ry="${f1(r * 0.07)}" fill="#ff8fa3" opacity=".7"/>`;
  const p = [];
  switch (emotion) {
    case 'happy':
      p.push(`<path d="M${f1(L - er * 2)} ${f1(ey + er)} Q${f1(L)} ${f1(ey - er * 2.6)} ${f1(L + er * 2)} ${f1(ey + er)}" ${st}/>`);
      p.push(`<path d="M${f1(R - er * 2)} ${f1(ey + er)} Q${f1(R)} ${f1(ey - er * 2.6)} ${f1(R + er * 2)} ${f1(ey + er)}" ${st}/>`);
      p.push(`<path d="M${f1(cx - mw)} ${f1(my - r * 0.08)} Q${f1(cx)} ${f1(my + r * 0.3)} ${f1(cx + mw)} ${f1(my - r * 0.08)} Z" fill="${ink}"/>`);
      p.push(blush());
      break;
    case 'sad':
      p.push(dot(L, ey), dot(R, ey));
      p.push(`<path d="M${f1(L - er * 2.4)} ${f1(ey - r * 0.12)} L${f1(L + er * 2)} ${f1(ey - r * 0.25)}" ${st}/><path d="M${f1(R + er * 2.4)} ${f1(ey - r * 0.12)} L${f1(R - er * 2)} ${f1(ey - r * 0.25)}" ${st}/>`);
      p.push(`<path d="M${f1(cx - mw)} ${f1(my + r * 0.08)} Q${f1(cx)} ${f1(my - r * 0.14)} ${f1(cx + mw)} ${f1(my + r * 0.08)}" ${st}/>`);
      p.push(`<path d="M${f1(R + er)} ${f1(ey + er * 2)} q${f1(-er * 1.2)} ${f1(er * 3)} 0 ${f1(er * 4)} q${f1(er * 1.2)} ${f1(-er)} 0 ${f1(-er * 4)}" fill="#74c0fc" stroke="#1c7ed6" stroke-width="${f1(sw * 0.5)}"/>`);
      break;
    case 'angry':
      p.push(dot(L, ey + er * 0.6), dot(R, ey + er * 0.6));
      p.push(`<path d="M${f1(L - er * 2.4)} ${f1(ey - r * 0.24)} L${f1(L + er * 2)} ${f1(ey - r * 0.08)}" ${st}/><path d="M${f1(R + er * 2.4)} ${f1(ey - r * 0.24)} L${f1(R - er * 2)} ${f1(ey - r * 0.08)}" ${st}/>`);
      p.push(`<path d="M${f1(cx - mw)} ${f1(my + r * 0.06)} Q${f1(cx)} ${f1(my - r * 0.12)} ${f1(cx + mw)} ${f1(my + r * 0.06)}" ${st}/>`);
      {
        const ax = cx + r * 0.62, ay = cy - r * 0.62, a = r * 0.13;
        p.push(`<path d="M${f1(ax - a)} ${f1(ay - a * 0.3)} h${f1(a * 0.7)} v${f1(-a * 0.7)} M${f1(ax + a)} ${f1(ay - a * 0.3)} h${f1(-a * 0.7)} v${f1(-a * 0.7)} M${f1(ax - a)} ${f1(ay + a * 0.3)} h${f1(a * 0.7)} v${f1(a * 0.7)} M${f1(ax + a)} ${f1(ay + a * 0.3)} h${f1(-a * 0.7)} v${f1(a * 0.7)}" stroke="#e03131" stroke-width="${f1(sw * 0.9)}" fill="none" stroke-linecap="round"/>`);
      }
      break;
    case 'surprised':
      {
        const ring = st.replace('fill="none"', 'fill="#fff"');
        p.push(`<circle cx="${f1(L)}" cy="${f1(ey)}" r="${f1(er * 2.1)}" ${ring}/>${dot(L, ey, er * 0.9)}<circle cx="${f1(R)}" cy="${f1(ey)}" r="${f1(er * 2.1)}" ${ring}/>${dot(R, ey, er * 0.9)}`);
      }
      p.push(`<ellipse cx="${f1(cx)}" cy="${f1(my + r * 0.04)}" rx="${f1(r * 0.12)}" ry="${f1(r * 0.17)}" fill="${ink}"/>`);
      break;
    case 'embarrassed':
      p.push(`<path d="M${f1(L - er * 1.8)} ${f1(ey - er)} L${f1(L + er * 1.6)} ${f1(ey)} L${f1(L - er * 1.8)} ${f1(ey + er)}" ${st}/><path d="M${f1(R + er * 1.8)} ${f1(ey - er)} L${f1(R - er * 1.6)} ${f1(ey)} L${f1(R + er * 1.8)} ${f1(ey + er)}" ${st}/>`);
      p.push(`<path d="M${f1(cx - mw)} ${f1(my)} q${f1(mw / 2)} ${f1(-r * 0.1)} ${f1(mw)} 0 t${f1(mw)} 0" ${st}/>`);
      p.push(`<path d="M${f1(cx + r * 0.75)} ${f1(cy - r * 0.5)} q${f1(-r * 0.1)} ${f1(r * 0.2)} 0 ${f1(r * 0.26)} q${f1(r * 0.1)} ${f1(-r * 0.06)} 0 ${f1(-r * 0.26)}" fill="#a5d8ff" stroke="#1c7ed6" stroke-width="${f1(sw * 0.5)}"/>`);
      p.push(blush());
      break;
    case 'love': {
      const heart = (x) => `<path d="M${f1(x)} ${f1(ey + er * 1.8)} C${f1(x - er * 3.4)} ${f1(ey - er * 0.4)} ${f1(x - er * 1.4)} ${f1(ey - er * 2.8)} ${f1(x)} ${f1(ey - er * 0.9)} C${f1(x + er * 1.4)} ${f1(ey - er * 2.8)} ${f1(x + er * 3.4)} ${f1(ey - er * 0.4)} ${f1(x)} ${f1(ey + er * 1.8)} Z" fill="#e64980"/>`;
      p.push(heart(L), heart(R));
      p.push(`<path d="M${f1(cx - mw * 0.8)} ${f1(my - r * 0.04)} Q${f1(cx)} ${f1(my + r * 0.18)} ${f1(cx + mw * 0.8)} ${f1(my - r * 0.04)}" ${st}/>`);
      p.push(blush());
      break;
    }
    case 'tired':
      p.push(`<path d="M${f1(L - er * 2)} ${f1(ey)} h${f1(er * 4)} M${f1(R - er * 2)} ${f1(ey)} h${f1(er * 4)}" ${st}/>`);
      p.push(`<path d="M${f1(L - er * 1.6)} ${f1(ey + er * 2)} q${f1(er * 1.6)} ${f1(er)} ${f1(er * 3.2)} 0 M${f1(R - er * 1.6)} ${f1(ey + er * 2)} q${f1(er * 1.6)} ${f1(er)} ${f1(er * 3.2)} 0" stroke="#868e96" stroke-width="${f1(sw * 0.6)}" fill="none"/>`);
      p.push(`<path d="M${f1(cx - mw * 0.7)} ${f1(my)} h${f1(mw * 1.4)}" ${st}/>`);
      break;
    case 'annoyed':
      p.push(`<path d="M${f1(L - er * 2)} ${f1(ey - er * 0.2)} h${f1(er * 4)} M${f1(R - er * 2)} ${f1(ey - er * 0.2)} h${f1(er * 4)}" ${st}/>${dot(L, ey + er * 0.7, er * 0.8)}${dot(R, ey + er * 0.7, er * 0.8)}`);
      p.push(`<path d="M${f1(cx - mw)} ${f1(my + r * 0.04)} L${f1(cx + mw)} ${f1(my - r * 0.06)}" ${st}/>`);
      break;
    case 'blank':
      p.push(dot(L, ey, er * 0.8), dot(R, ey, er * 0.8));
      p.push(`<path d="M${f1(cx - mw * 0.5)} ${f1(my)} h${f1(mw)}" ${st}/>`);
      break;
    default:
      p.push(dot(L, ey), dot(R, ey));
      p.push(`<path d="M${f1(cx - mw * 0.7)} ${f1(my - r * 0.04)} Q${f1(cx)} ${f1(my + r * 0.14)} ${f1(cx + mw * 0.7)} ${f1(my - r * 0.04)}" ${st}/>`);
  }
  return p.join('');
}

// ── 몸 동작: 각 관절 각도(도). 0 = 아래, 90 = 바깥 수평, 180 = 위 ─────────
const POSES = {
  stand: { l: [12, 8], r: [12, 8], ll: [4, 2], rl: [4, 2] },
  wave: { l: [12, 8], r: [140, 175], ll: [4, 2], rl: [4, 2] },
  point: { l: [12, 8], r: [88, 92], ll: [4, 2], rl: [4, 2] },
  run: { l: [-40, 40], r: [50, 120], ll: [-28, 10], rl: [32, -25], lean: 6 },
  sit: { l: [20, 40], r: [20, 40], ll: [80, 0], rl: [80, 0], lift: -28, seat: true },
  jump: { l: [150, 170], r: [150, 170], ll: [30, -10], rl: [30, -10], lift: 30 },
  arms: { l: [30, -95], r: [30, -95], ll: [4, 2], rl: [4, 2] },
  cheer: { l: [160, 178], r: [160, 178], ll: [8, 4], rl: [8, 4] },
  scratch: { l: [12, 8], r: [150, -150], ll: [4, 2], rl: [4, 2] },
  phone: { l: [12, 8], r: [25, -160], ll: [4, 2], rl: [4, 2] },
};

function limb(x, y, side, a1, a2, l1, l2) {
  const rad = (d) => (d * Math.PI) / 180;
  const x1 = x + Math.sin(rad(a1)) * l1 * side, y1 = y + Math.cos(rad(a1)) * l1;
  const x2 = x1 + Math.sin(rad(a2)) * l2 * side, y2 = y1 + Math.cos(rad(a2)) * l2;
  return { d: `M${f1(x)} ${f1(y)} L${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}`, end: [x2, y2] };
}

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function figure(style, emotion, action, color, ink = '#1b1f2a') {
  const pose = POSES[action] || POSES.stand;
  const lift = pose.lift || 0;
  const f = FIGURE[style] || FIGURE.sd;
  const shirt = lighten(color, 0.45);
  const parts = [];
  const g = (s) => parts.push(s);
  const line = (d, w) => `<path d="${d}" stroke="${ink}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (pose.seat) g(`<rect x="-46" y="-44" width="92" height="44" rx="6" fill="#dee2e6" stroke="#adb5bd" stroke-width="3"/>`);
  g(`<g transform="translate(0 ${-lift}) rotate(${pose.lean || 0} 0 -60)">`);
  if (style === 'stick') {
    const sh = -130, hip = -70, w = 7;
    g(line(limb(0, hip, -1, ...pose.ll, 36, 34).d, w) + line(limb(0, hip, 1, ...pose.rl, 36, 34).d, w));
    g(line(`M0 ${f.headY + f.headR} L0 ${hip}`, w));
    g(line(limb(0, sh, -1, ...pose.l, 34, 32).d, w) + line(limb(0, sh, 1, ...pose.r, 34, 32).d, w));
    g(`<circle cx="0" cy="${f.headY}" r="${f.headR}" fill="#fff" stroke="${ink}" stroke-width="${w}"/>`);
    g(`<path d="M${-f.headR} ${f.headY - 4} A${f.headR} ${f.headR} 0 0 1 ${f.headR} ${f.headY - 4} Q0 ${f.headY - f.headR * 0.5} ${-f.headR} ${f.headY - 4} Z" fill="${color}"/>`);
    g(face(0, f.headY + 3, f.headR * 0.95, emotion, ink));
  } else if (style === 'bean') {
    const w = 5;
    g(line(limb(-20, -14, -1, ...pose.ll.map((a) => a * 0.6), 9, 7).d, w + 2) + line(limb(20, -14, 1, ...pose.rl.map((a) => a * 0.6), 9, 7).d, w + 2));
    g(line(limb(-50, -78, -1, ...pose.l, 22, 18).d, w + 1) + line(limb(50, -78, 1, ...pose.r, 22, 18).d, w + 1));
    g(`<ellipse cx="0" cy="-88" rx="56" ry="78" fill="${shirt}" stroke="${ink}" stroke-width="${w}"/>`);
    g(`<path d="M-48 -128 Q-30 -170 0 -166 Q36 -166 50 -124 Q20 -146 -48 -128 Z" fill="${color}"/>`);
    g(face(0, f.headY, f.headR, emotion, ink));
  } else {
    const w = 5;
    g(line(limb(-13, -42, -1, ...pose.ll, 22, 20).d, w + 3) + line(limb(13, -42, 1, ...pose.rl, 22, 20).d, w + 3));
    g(`<rect x="-30" y="-98" width="60" height="60" rx="18" fill="${shirt}" stroke="${ink}" stroke-width="${w}"/>`);
    const la = limb(-26, -88, -1, ...pose.l, 26, 24), ra = limb(26, -88, 1, ...pose.r, 26, 24);
    for (const a of [la, ra]) g(line(a.d, w + 8) + `<path d="${a.d}" stroke="${shirt}" stroke-width="${w + 1}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    g(`<circle cx="0" cy="${f.headY}" r="${f.headR}" fill="#fff6ee" stroke="${ink}" stroke-width="${w}"/>`);
    g(`<path d="M${-f.headR - 2} ${f.headY + 6} C${-f.headR} ${f.headY - f.headR * 1.25} ${f.headR} ${f.headY - f.headR * 1.25} ${f.headR + 2} ${f.headY + 6} C${f.headR * 0.5} ${f.headY - f.headR * 0.55} ${-f.headR * 0.4} ${f.headY - f.headR * 0.6} ${-f.headR - 2} ${f.headY + 6} Z" fill="${color}" stroke="${ink}" stroke-width="${w * 0.8}" stroke-linejoin="round"/>`);
    g(face(0, f.headY + 8, f.headR * 0.9, emotion, ink));
  }
  if (action === 'phone') g(`<rect x="34" y="${style === 'bean' ? -120 : style === 'stick' ? -190 : -160}" width="14" height="24" rx="3" fill="#495057"/>`);
  g('</g>');
  return parts.join('');
}

export function drawCharacter(item, character, style, opts = {}) {
  const s = figureScale(item);
  const color = character ? character.color : '#868e96';
  const body = figure(style, item.emotion, item.action, color);
  const flip = item.flip ? -1 : 1;
  let label = '';
  if (opts.labels && character) {
    const fs = Math.max(12, 15 / Math.max(s, 0.35) * 0.9);
    label = `<text x="0" y="${f1(-4)}" font-size="${f1(fs * s)}" text-anchor="middle" fill="${color}" font-family="IBM Plex Sans KR, sans-serif" font-weight="700" class="guide-label" transform="translate(0 ${f1(-(characterBox(item, style).h) - 8)})" paint-order="stroke" stroke="#fff" stroke-width="4">${esc(character.name)}</text>`;
  }
  return `<g class="item char" data-id="${item.id}" transform="translate(${f1(item.x)} ${f1(item.y)})"><g transform="scale(${f1(s * flip * 1000) / 1000} ${f1(s * 1000) / 1000})">${body}</g>${label}<rect class="hit" x="${f1(-(FIGURE[style] || FIGURE.sd).halfW * s)}" y="${f1(-characterBox(item, style).h)}" width="${f1((FIGURE[style] || FIGURE.sd).halfW * 2 * s)}" height="${f1(characterBox(item, style).h)}" fill="transparent"/></g>`;
}

// ── 말풍선 ────────────────────────────────────────────────────────────
function ellipsePoint(cx, cy, rx, ry, ang) {
  return [cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry];
}

function tailTarget(item, panel, style) {
  if (!item.tailTo) return null;
  const c = panel.items.find((o) => o.id === item.tailTo);
  if (!c) return null;
  const h = headBox(c, style);
  return { x: h.cx, y: h.y + h.r * 0.2, r: h.r };
}

export function drawBubble(item, panel, settings, opts = {}) {
  const ink = '#1b1f2a', sw = 3;
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2, rx = item.w / 2, ry = item.h / 2;
  const target = item.kind === 'narration' ? null : tailTarget(item, panel, settings.style);
  let outline = '', fill = '';
  let tail = null;
  if (target) {
    const ang = Math.atan2(target.y - cy, target.x - cx);
    const dist = Math.hypot(target.x - cx, target.y - cy);
    const edge = Math.hypot(Math.cos(ang) * rx, Math.sin(ang) * ry);
    const len = Math.max(0, Math.min(dist - edge - target.r * 1.15, Math.max(40, ry * 1.4)));
    if (len > 6) tail = { ang, len, edge };
  }
  const k = item.kind;
  if (k === 'narration') {
    outline = `<rect x="${f1(item.x)}" y="${f1(item.y)}" width="${f1(item.w)}" height="${f1(item.h)}" fill="#fffbe6" stroke="${ink}" stroke-width="${sw}"/>`;
  } else if (k === 'thought') {
    const bumps = Math.max(8, Math.round((item.w + item.h) / 34));
    const circles = [];
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * Math.PI * 2;
      const [x, y] = ellipsePoint(cx, cy, rx * 0.86, ry * 0.8, a);
      circles.push([x, y, Math.max(14, Math.min(rx, ry) * 0.36)]);
    }
    const shapes = (extra) => circles.map(([x, y, r]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" ${extra}/>`).join('') + `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx * 0.86)}" ry="${f1(ry * 0.8)}" ${extra}/>`;
    outline = `<g>${shapes(`fill="${ink}" stroke="${ink}" stroke-width="${sw * 2}"`)}</g>`;
    fill = `<g>${shapes('fill="#fff"')}</g>`;
    if (tail) {
      const dots = [0.25, 0.6, 0.9].map((t, i) => {
        const [x, y] = ellipsePoint(cx, cy, rx + tail.len * t, ry + tail.len * t, tail.ang);
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(9 - i * 2.5)}" fill="#fff" stroke="${ink}" stroke-width="${sw}"/>`;
      });
      fill += dots.join('');
    }
  } else if (k === 'shout') {
    const spikes = Math.max(12, Math.round((item.w + item.h) / 26));
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const out = i % 2 === 0 ? 1 : 0.8;
      let [x, y] = ellipsePoint(cx, cy, rx * out, ry * out, a);
      if (tail && i % 2 === 0 && Math.abs(Math.atan2(Math.sin(a - tail.ang), Math.cos(a - tail.ang))) < Math.PI / spikes) {
        [x, y] = ellipsePoint(cx, cy, rx + tail.len, ry + tail.len, tail.ang);
      }
      pts.push(`${f1(x)},${f1(y)}`);
    }
    outline = `<polygon points="${pts.join(' ')}" fill="#fff" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="miter"/>`;
  } else {
    const dash = k === 'whisper' ? ' stroke-dasharray="10 7"' : '';
    let tailPath = '';
    if (tail) {
      const spread = 0.2;
      const [ax, ay] = ellipsePoint(cx, cy, rx * 0.96, ry * 0.96, tail.ang - spread);
      const [bx, by] = ellipsePoint(cx, cy, rx * 0.96, ry * 0.96, tail.ang + spread);
      const [tx, ty] = ellipsePoint(cx, cy, rx + tail.len, ry + tail.len, tail.ang);
      tailPath = `M${f1(ax)} ${f1(ay)} Q${f1((ax + tx) / 2)} ${f1((ay + ty) / 2)} ${f1(tx)} ${f1(ty)} Q${f1((bx + tx) / 2)} ${f1((by + ty) / 2)} ${f1(bx)} ${f1(by)} Z`;
    }
    if (k === 'whisper') {
      outline = (tailPath ? `<path d="${tailPath}" fill="#fff" stroke="${ink}" stroke-width="${sw}"${dash}/>` : '') + `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="#fff" stroke="${ink}" stroke-width="${sw}"${dash}/>`;
    } else {
      const both = (a) => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" ${a}/>` + (tailPath ? `<path d="${tailPath}" ${a}/>` : '');
      outline = both(`fill="${ink}" stroke="${ink}" stroke-width="${sw * 2}" stroke-linejoin="round"`);
      fill = both('fill="#fff"');
    }
  }
  const role = bubbleRole(item);
  const font = settings.fonts[role];
  const size = item.fontSize || font.size;
  const lines = item.lines || [item.text];
  const lh = size * 1.3;
  const startY = cy - ((lines.length - 1) * lh) / 2;
  const weight = k === 'shout' ? ' font-weight="700"' : '';
  const text = lines.map((l, i) => `<text x="${f1(cx)}" y="${f1(startY + i * lh)}" dominant-baseline="central" text-anchor="middle" font-family="'${esc(font.family)}', sans-serif" font-size="${f1(size)}"${weight} fill="${ink}">${esc(l)}</text>`).join('');
  return `<g class="item bubble" data-id="${item.id}">${outline}${fill}${text}<rect class="hit" x="${f1(item.x)}" y="${f1(item.y)}" width="${f1(item.w)}" height="${f1(item.h)}" fill="transparent"/></g>`;
}

// ── 배경 가이드: 대략적인 선만 그린다 ───────────────────────────────────
export function drawBackground(bg, r) {
  const c = '#c9ced6', c2 = '#e3e6eb', sw = 2.5;
  const L = (d, color = c, w = sw) => `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const R = (x, y, w, h, extra = '') => `<rect x="${f1(r.x + x * r.w)}" y="${f1(r.y + y * r.h)}" width="${f1(w * r.w)}" height="${f1(h * r.h)}" fill="${c2}" stroke="${c}" stroke-width="${sw}" ${extra}/>`;
  const X = (t) => f1(r.x + t * r.w), Y = (t) => f1(r.y + t * r.h);
  const out = [];
  if (bg.night) out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#e7eaf6"/>`);
  const horizon = 0.62;
  switch (bg.kind) {
    case 'cafe':
      out.push(L(`M${X(0)} ${Y(horizon)} H${X(1)}`));
      out.push(R(0.06, 0.12, 0.3, 0.3, 'rx="6"'), L(`M${X(0.21)} ${Y(0.12)} V${Y(0.42)} M${X(0.06)} ${Y(0.27)} H${X(0.36)}`));
      out.push(R(0.62, 0.16, 0.3, 0.14, 'rx="4"'), L(`M${X(0.65)} ${Y(0.21)} H${X(0.85)} M${X(0.65)} ${Y(0.25)} H${X(0.8)}`));
      out.push(L(`M${X(0.4)} ${Y(0.7)} h${f1(r.w * 0.22)} M${X(0.51)} ${Y(0.7)} V${Y(0.92)}`));
      out.push(`<path d="M${X(0.18)} ${Y(0.02)} V${Y(0.07)}" stroke="${c}" stroke-width="${sw}"/><path d="M${X(0.14)} ${Y(0.1)} Q${X(0.18)} ${Y(0.04)} ${X(0.22)} ${Y(0.1)} Z" fill="${c2}" stroke="${c}" stroke-width="${sw}"/>`);
      break;
    case 'room':
      out.push(L(`M${X(0)} ${Y(horizon)} H${X(1)}`));
      out.push(R(0.62, 0.12, 0.26, 0.24, 'rx="3"'), L(`M${X(0.75)} ${Y(0.12)} V${Y(0.36)}`));
      out.push(R(0.04, 0.46, 0.34, 0.2, 'rx="14"'), R(0.08, 0.38, 0.26, 0.12, 'rx="10"'));
      out.push(L(`M${X(0.47)} ${Y(0.12)} v${f1(r.h * 0.1)}`), `<circle cx="${X(0.47)}" cy="${Y(0.25)}" r="${f1(Math.min(r.w, r.h) * 0.03)}" fill="${c2}" stroke="${c}" stroke-width="${sw}"/>`);
      break;
    case 'classroom':
      out.push(L(`M${X(0)} ${Y(horizon)} H${X(1)}`));
      out.push(`<rect x="${X(0.08)}" y="${Y(0.1)}" width="${f1(r.w * 0.6)}" height="${f1(r.h * 0.3)}" fill="#dbe7df" stroke="${c}" stroke-width="${sw}"/>`);
      out.push(L(`M${X(0.12)} ${Y(0.2)} H${X(0.36)} M${X(0.12)} ${Y(0.28)} H${X(0.3)}`));
      out.push(R(0.76, 0.1, 0.16, 0.38), L(`M${X(0.84)} ${Y(0.1)} V${Y(0.48)}`));
      break;
    case 'office':
      out.push(L(`M${X(0)} ${Y(horizon)} H${X(1)}`));
      for (let i = 0; i < 3; i++) out.push(R(0.06 + i * 0.3, 0.1, 0.24, 0.32));
      out.push(R(0.32, 0.66, 0.36, 0.06), L(`M${X(0.36)} ${Y(0.72)} V${Y(0.95)} M${X(0.64)} ${Y(0.72)} V${Y(0.95)}`));
      out.push(R(0.43, 0.54, 0.14, 0.12, 'rx="3"'));
      break;
    case 'street':
      out.push(R(0.02, 0.08, 0.22, 0.58), R(0.28, 0.2, 0.2, 0.46), R(0.74, 0.04, 0.24, 0.62));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(`<rect x="${X(0.05 + i * 0.065)}" y="${Y(0.14 + j * 0.15)}" width="${f1(r.w * 0.035)}" height="${f1(r.h * 0.07)}" fill="#fff" stroke="${c}" stroke-width="1.5"/>`);
      out.push(L(`M${X(0)} ${Y(0.66)} H${X(1)}`), L(`M${X(0.55)} ${Y(0.66)} V${Y(0.3)}`), `<circle cx="${X(0.55)}" cy="${Y(0.28)}" r="${f1(r.h * 0.025)}" fill="${c2}" stroke="${c}" stroke-width="${sw}"/>`);
      break;
    case 'park':
      out.push(L(`M${X(0)} ${Y(0.64)} Q${X(0.5)} ${Y(0.58)} ${X(1)} ${Y(0.64)}`));
      for (const t of [0.12, 0.84]) out.push(L(`M${X(t)} ${Y(0.64)} V${Y(0.4)}`, c, sw * 2), `<ellipse cx="${X(t)}" cy="${Y(0.3)}" rx="${f1(r.w * 0.1)}" ry="${f1(r.h * 0.15)}" fill="${c2}" stroke="${c}" stroke-width="${sw}"/>`);
      out.push(R(0.36, 0.6, 0.28, 0.04), L(`M${X(0.39)} ${Y(0.64)} V${Y(0.72)} M${X(0.61)} ${Y(0.64)} V${Y(0.72)}`));
      out.push(L(`M${X(0.3)} ${Y(0.14)} q${f1(r.w * 0.03)} ${f1(-r.h * 0.04)} ${f1(r.w * 0.06)} 0 q${f1(r.w * 0.03)} ${f1(-r.h * 0.05)} ${f1(r.w * 0.07)} 0`));
      break;
    case 'beach':
      out.push(L(`M${X(0)} ${Y(0.45)} H${X(1)}`), L(`M${X(0)} ${Y(0.66)} Q${X(0.25)} ${Y(0.6)} ${X(0.5)} ${Y(0.66)} T${X(1)} ${Y(0.64)}`));
      out.push(`<circle cx="${X(0.78)}" cy="${Y(0.2)}" r="${f1(Math.min(r.w, r.h) * 0.08)}" fill="${bg.night ? '#f1f3f5' : '#fff3bf'}" stroke="${c}" stroke-width="${sw}"/>`);
      out.push(L(`M${X(0.1)} ${Y(0.52)} q${f1(r.w * 0.03)} ${f1(-r.h * 0.02)} ${f1(r.w * 0.06)} 0 M${X(0.4)} ${Y(0.55)} q${f1(r.w * 0.03)} ${f1(-r.h * 0.02)} ${f1(r.w * 0.06)} 0`));
      break;
    case 'bus':
      out.push(L(`M${X(0)} ${Y(0.68)} H${X(1)}`));
      for (let i = 0; i < 3; i++) out.push(R(0.05 + i * 0.32, 0.12, 0.26, 0.24, 'rx="10"'));
      out.push(L(`M${X(0)} ${Y(0.06)} H${X(1)}`), ...[0.2, 0.5, 0.8].map((t) => L(`M${X(t)} ${Y(0.06)} V${Y(0.16)}`) + `<circle cx="${X(t)}" cy="${Y(0.18)}" r="${f1(r.h * 0.02)}" fill="none" stroke="${c}" stroke-width="${sw}"/>`));
      break;
    case 'store':
      out.push(L(`M${X(0)} ${Y(horizon)} H${X(1)}`));
      for (let j = 0; j < 3; j++) out.push(L(`M${X(0.05)} ${Y(0.14 + j * 0.15)} H${X(0.55)}`));
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) out.push(`<rect x="${X(0.07 + i * 0.06)}" y="${Y(0.06 + j * 0.15)}" width="${f1(r.w * 0.04)}" height="${f1(r.h * 0.08)}" fill="${c2}" stroke="${c}" stroke-width="1.5"/>`);
      out.push(R(0.66, 0.44, 0.3, 0.22));
      break;
    default:
      break;
  }
  return out.join('');
}

// ── 전체 ──────────────────────────────────────────────────────────────
export function renderProject(project, opts = {}) {
  const { settings } = project;
  const W = settings.width, H = settings.height;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  const tH = titleHeight(settings, !!project.title);
  if (tH) {
    const tf = settings.fonts.title;
    parts.push(`<g class="item title" data-id="title"><text x="${W / 2}" y="${f1(settings.margin + tH / 2)}" dominant-baseline="central" text-anchor="middle" font-family="'${esc(tf.family)}', sans-serif" font-size="${tf.size}" fill="#1b1f2a">${esc(project.title)}</text></g>`);
  }
  project.panels.forEach((p, i) => {
    const clip = `clip_${p.id}`;
    parts.push(`<clipPath id="${clip}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/></clipPath>`);
    parts.push(`<g class="panel" data-panel="${p.id}"><rect class="panel-bg" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fff"/>`);
    parts.push(`<g clip-path="url(#${clip})">`);
    if (opts.background !== false) parts.push(drawBackground(p.background || { kind: 'none' }, p));
    if (opts.guides && p.background && p.background.kind !== 'none') {
      parts.push(`<text class="guide-label" x="${p.x + p.w - 10}" y="${p.y + p.h - 10}" text-anchor="end" font-size="16" fill="#98a2b3" font-family="IBM Plex Sans KR, sans-serif">배경 · ${esc(p.background.label || p.background.kind)}</text>`);
    }
    for (const it of p.items) {
      if (it.type === 'character') parts.push(drawCharacter(it, project.characters.find((c) => c.id === it.charId), settings.style, { labels: opts.guides }));
    }
    parts.push('</g>');
    for (const it of p.items) if (it.type === 'bubble') parts.push(drawBubble(it, p, settings, opts));
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#1b1f2a" stroke-width="4" pointer-events="none"/>`);
    if (opts.guides) parts.push(`<text class="guide-label" x="${p.x + 10}" y="${p.y + p.h - 10}" font-size="16" fill="#98a2b3" font-family="IBM Plex Sans KR, sans-serif" pointer-events="none">${i + 1}컷</text>`);
    parts.push('</g>');
  });
  return { width: W, height: H, inner: parts.join('') };
}
