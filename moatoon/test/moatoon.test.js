import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript } from '../js/script.js';
import { checkSpelling, checkFacts } from '../js/spell.js';
import { generateProject, computePanels, refineCharacter, placeBubble, characterBox, headBox } from '../js/layout.js';
import { renderProject } from '../js/render.js';
import { defaultSettings } from '../js/catalog.js';

// 한글 1자 = 글자 크기, 나머지 = 0.55배로 어림잡는 측정 함수
const measure = (t, _f, size) => [...t].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? size : size * 0.55), 0);

const SCRIPT = `제목: 테스트
#1 카페, 아침
민지(기쁨): 안녕!
준호(속마음): 수상해
(민지가 손을 흔든다)
#2 사무실, 밤
내레이션: 그날 오후
팀장(화남): 보고서 아직이야!!
준호: 지금 할게요 ㅠㅠ`;

test('스크립트를 장면·인물·대사로 나눈다', () => {
  const p = parseScript(SCRIPT);
  assert.equal(p.title, '테스트');
  assert.equal(p.scenes.length, 2);
  assert.deepEqual(p.characters, ['민지', '준호', '팀장']);
  const [s1, s2] = p.scenes;
  assert.equal(s1.background.kind, 'cafe');
  assert.equal(s2.background.kind, 'office');
  assert.equal(s2.background.night, true);
  assert.deepEqual(s1.lines.map((l) => l.kind), ['speech', 'thought']);
  const minji = s1.cast.find((c) => c.name === '민지');
  assert.equal(minji.emotion, 'happy');
  assert.equal(minji.action, 'wave');
  assert.deepEqual(s2.lines.map((l) => l.kind), ['narration', 'shout', 'speech']);
  assert.equal(s2.cast.find((c) => c.name === '준호').emotion, 'sad');
});

test('자주 틀리는 맞춤법을 고친다', () => {
  const cases = [
    ['내가 살께!', '내가 살게!'],
    ['몇일 만이야', '며칠 만이야'],
    ['어떻해… 안되…', '어떡해… 안 돼…'],
    ['일이 잘 됬어', '일이 잘 됐어'],
    ['지금 할려고 했어요', '지금 하려고 했어요'],
    ['그거 내꺼야', '그거 내 거야'],
    ['할수있어', '할 수 있어'],
    ['야근 화이팅', '야근 파이팅'],
    ['갈때 말해', '갈 때 말해'],
    ['그럴것같아', '그럴 것 같아'],
    ['이제 되요', '이제 돼요'],
  ];
  for (const [inp, out] of cases) assert.equal(checkSpelling(inp).suggestion, out, inp);
});

test('맞는 문장은 건드리지 않는다', () => {
  for (const s of ['선생님께 드려', '별것 아니야', '별수 없지', '오늘은 내가 살게!', '조금만 더 놀려고', '쓸데없이 왜 그래', '가되 조심해']) {
    assert.equal(checkSpelling(s).suggestion, s, s);
  }
});

test('숫자·최초 같은 주장은 사실 확인 대상으로 표시한다', () => {
  assert.equal(checkFacts('아메리카노는 1900년에 처음 만들어졌대').length, 1);
  assert.equal(checkFacts('오늘 날씨 좋다').length, 0);
});

test('가이드 생성: 장면 수만큼 컷, 말풍선은 컷 안에, 서로 덜 겹치게', () => {
  const s = defaultSettings();
  const res = generateProject(parseScript(SCRIPT), s, [], measure);
  assert.equal(res.panels.length, 2);
  for (const p of res.panels) {
    const bubbles = p.items.filter((i) => i.type === 'bubble');
    for (const b of bubbles) {
      assert.ok(b.x >= p.x && b.y >= p.y && b.x + b.w <= p.x + p.w && b.y + b.h <= p.y + p.h, '말풍선이 컷 밖으로 나감');
    }
    for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i], b = bubbles[j];
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.equal(ox * oy, 0, '말풍선끼리 겹침');
    }
  }
  const out = renderProject({ ...res, settings: s }, { guides: true });
  assert.match(out.inner, /안녕!/);
});

test('드롭 다듬기: 바닥선에 세우고 다른 인물과 겹치지 않게 민다', () => {
  const s = defaultSettings();
  const [panel] = computePanels(s, 'v3', false);
  panel.items = [];
  const a = { id: 'a', type: 'character', x: panel.x + 300, y: 0, size: 200, action: 'stand' };
  refineCharacter(panel, a, panel.items, 'sd', { keepSize: true });
  panel.items.push(a);
  const b = { id: 'b', type: 'character', x: panel.x + 305, y: panel.y + 10, size: 200, action: 'stand' };
  refineCharacter(panel, b, panel.items, 'sd', { keepSize: true });
  assert.equal(b.y, a.y);
  const A = characterBox(a, 'sd'), B = characterBox(b, 'sd');
  assert.ok(Math.abs(a.x - b.x) >= A.w * 0.8, '두 인물이 너무 붙음');
  const bub = { id: 'x', type: 'bubble', kind: 'speech', tailTo: 'a', w: 200, h: 100, x: 0, y: 0 };
  placeBubble(panel, bub, [a, b], 'sd');
  const h = headBox(a, 'sd');
  const ov = Math.max(0, Math.min(bub.x + bub.w, h.x + h.w) - Math.max(bub.x, h.x)) * Math.max(0, Math.min(bub.y + bub.h, h.y + h.h) - Math.max(bub.y, h.y));
  assert.equal(ov, 0, '말풍선이 머리를 가림');
  void B;
});

test('그린 SVG에 같은 속성이 두 번 들어가지 않는다 (내보내기 오류 방지)', async () => {
  const { EMOTIONS, ACTIONS, STYLES } = await import('../js/catalog.js');
  const { figure } = await import('../js/render.js');
  for (const st of STYLES) for (const e of EMOTIONS) for (const a of ACTIONS) {
    const svg = figure(st.id, e.id, a.id, '#1c7ed6');
    for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
      const names = [...tag.matchAll(/\s([a-zA-Z-:]+)="/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `${st.id}/${e.id}/${a.id}: ${tag}`);
    }
  }
});

test('읽는 순서: 같은 컷에서 뒤 대사가 앞 대사보다 위로 올라가지 않는다', () => {
  const s = defaultSettings();
  const res = generateProject(parseScript(SCRIPT), s, [], measure);
  for (const p of res.panels) {
    const bs = p.items.filter((i) => i.type === 'bubble');
    for (let i = 1; i < bs.length; i++) assert.ok(bs[i].y >= bs[i - 1].y - 4, `${bs[i].text} 이(가) ${bs[i - 1].text} 보다 위`);
  }
});

test('모서리로 크기를 정한 말풍선은 크기를 지키고 글을 그 안에 맞춘다', async () => {
  const { sizeBubble } = await import('../js/layout.js');
  const s = defaultSettings();
  const [panel] = computePanels(s, 'v3', false);
  const text = '오늘 커피는 내가 살게! 대신 내일은 네가 사';
  const auto = sizeBubble({ kind: 'speech', text }, panel, s, measure);
  const narrow = sizeBubble({ kind: 'speech', text, manual: true, w: 200, h: 220 }, panel, s, measure);
  assert.equal(narrow.w, 200);
  assert.equal(narrow.h, 220);
  assert.ok(narrow.lines.length > auto.lines.length, '좁히면 줄이 늘어나야 함');
  const tiny = sizeBubble({ kind: 'speech', text, manual: true, w: 120, h: 60 }, panel, s, measure);
  assert.ok(tiny.fontSize < s.fonts.dialogue.size, '넘치면 글자가 작아져야 함');
  const big = sizeBubble({ kind: 'speech', text, manual: true, w: 900, h: 300 }, panel, s, measure);
  assert.equal(big.fontSize, s.fonts.dialogue.size, '넓혀도 기본 글자 크기보다 커지지 않음');
});

// ── 2단계: 여러 페이지, 레이아웃, 질감, 워터마크 ──
const EP = `제목: 커피
회차: 3화
부제: 수상한 친절
#1 카페
민지: 하나
#2 카페
준호: 둘
#3 사무실
민지: 셋
#4 거리
준호: 넷
#5 공원
민지: 다섯
[마지막]
- 요약 하나
요약: 요약 둘
마무리: 다음 화에서 만나요!`;

test('회차 스크립트 → 표지·내용·마지막 페이지', async () => {
  const { buildPages } = await import('../js/pages.js');
  const { withDefaults } = await import('../js/catalog.js');
  const s = withDefaults(null);
  const parsed = parseScript(EP);
  assert.equal(parsed.episode, '3화');
  assert.deepEqual(parsed.summary, ['요약 하나', '요약 둘']);
  const res = buildPages(parsed, s, [], [], measure);
  assert.deepEqual(res.pages.map((p) => p.kind), ['cover', 'content', 'content', 'ending']); // 페이지당 4컷 → 5장면이면 내용 2장
  const cover = res.pages[0];
  assert.equal(cover.texts.find((t) => t.slot === 'title').text, '커피');
  assert.equal(cover.texts.find((t) => t.slot === 'episode').text, '3화');
  const ending = res.pages[3];
  assert.equal(ending.texts.find((t) => t.slot === 'summary').text, '요약 하나\n요약 둘');
  assert.ok(ending.panels[0].items.some((i) => i.type === 'bubble' && i.text === '다음 화에서 만나요!'));
});

test('페이지를 레이아웃으로 등록하고 다른 크기 캔버스에 적용', async () => {
  const { buildPages, templateFromPage, applyTemplate } = await import('../js/pages.js');
  const { withDefaults } = await import('../js/catalog.js');
  const s = withDefaults(null);
  const res = buildPages(parseScript(EP), s, [], [], measure);
  const page = res.pages[1];
  const tpl = templateFromPage(page, s, '내 4컷', 'content');
  assert.equal(tpl.panels.length, page.panels.length);
  for (const r of tpl.panels) for (const v of [r.x, r.y, r.w, r.h]) assert.ok(v >= 0 && v <= 1);
  const sq = withDefaults({ width: 1080, height: 1080 });
  const other = buildPages(parseScript(EP), sq, [], [], measure).pages[2];
  const before = other.panels.flatMap((p) => p.items).length;
  applyTemplate(other, tpl, sq, measure);
  assert.equal(other.panels.length, tpl.panels.length);
  assert.equal(other.panels.flatMap((p) => p.items).length, before, '컷 수가 같거나 많으면 내용이 빠지지 않음');
  for (const p of other.panels) assert.ok(p.y + p.h <= 1080 + 1);
});

test('워터마크·페이지 번호는 고른 위치(3×3)와 여백에 고정된다', async () => {
  const { drawMarks, pageNumberText } = await import('../js/render.js');
  const { withDefaults } = await import('../js/catalog.js');
  const s = withDefaults(null);
  s.watermark = { ...s.watermark, anchor: 'tl', dx: 30, dy: 40, size: 20 };
  s.pageNumber = { ...s.pageNumber, anchor: 'br', dx: 50, dy: 60, size: 20, format: 'n/total' };
  const svg = drawMarks(s, {}, 1, 5, 'content');
  const wmX = Number(svg.match(/<text[^>]*x="([\d.]+)"[^>]*>@my_moatoon/)[1]);
  assert.ok(wmX > 30 && wmX < 30 + 200, '왼쪽 위 워터마크');
  const pn = svg.match(/<text[^>]*x="([\d.]+)" y="([\d.]+)"[^>]*>2 \/ 5/);
  assert.ok(Number(pn[1]) < 1080 - 50 && Number(pn[1]) > 900, '오른쪽 아래 페이지 번호 x');
  assert.ok(Math.abs(Number(pn[2]) - (1350 - 60 - 10)) < 1, '오른쪽 아래 페이지 번호 y');
  assert.equal(drawMarks({ ...s, pageNumber: { ...s.pageNumber, skipCover: true }, watermark: { ...s.watermark, enabled: false } }, {}, 0, 5, 'cover'), '');
  assert.equal(pageNumberText('0n', 3, 9), '03');
  assert.equal(pageNumberText('dash', 3, 9), '- 3 -');
});

test('질감 필터와 이미지 변형 SVG에 같은 속성이 두 번 들어가지 않는다', async () => {
  const { textureDefs, textureFilterAttr } = await import('../js/texture.js');
  const { drawImageFigure, entryCrop } = await import('../js/render.js');
  const { TEXTURES } = await import('../js/catalog.js');
  const check = (svg, label) => {
    for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
      const names = [...tag.matchAll(/\s([a-zA-Z-:]+)="/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `${label}: ${tag}`);
    }
  };
  for (const t of TEXTURES) {
    check(textureDefs(t.id), t.id);
    assert.equal(textureFilterAttr(t.id) === '', t.id === 'clean');
  }
  const asset = { url: 'data:image/png;base64,AA', w: 400, h: 600 };
  for (const crop of ['full', 'bust', 'face']) {
    const e = { transform: { crop, flip: true, rotate: 5, outline: true, shadow: true, plate: 'circle', plateColor: '#ffe066' }, faceBox: { x: 0.2, y: 0.05, w: 0.6, h: 0.35 } };
    check(drawImageFigure({ x: 0, y: 0, w: 100, h: 150 }, e, asset, false), crop);
    const c = entryCrop(e, asset);
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 400 && c.y + c.h <= 600, `${crop} 자르기가 원본 안`);
  }
});

test('컷 테두리 선 질감·굵기·색이 그림 질감과 따로 들어간다', async () => {
  const { buildPages } = await import('../js/pages.js');
  const { renderPage } = await import('../js/render.js');
  const { withDefaults } = await import('../js/catalog.js');
  const s = withDefaults({ texture: 'watercolor', border: { texture: 'pen', width: 7, color: '#334455' } });
  const res = buildPages(parseScript(EP), s, [], [], measure);
  const { inner } = renderPage(res.pages[1], { project: res, settings: s, assets: {}, index: 1, total: 4, opts: {} });
  assert.match(inner, /id="tex-watercolor"/);
  assert.match(inner, /id="tex-pen"/);
  assert.match(inner, /stroke="#334455" stroke-width="7" filter="url\(#tex-pen\)"/);
  assert.equal(withDefaults({}).border.texture, 'clean', '예전 설정에도 기본값이 채워짐');
});

test('조작한 회차 파일의 값이 화면(SVG)에 스크립트로 들어가지 못한다', async () => {
  const { sanitizeEpisode, sanitizeAsset } = await import('../js/sanitize.js');
  const { renderPage } = await import('../js/render.js');
  const evil = '" onload="alert(1)" x="';
  const ep = sanitizeEpisode({
    id: 'ep1', name: '<img src=x onerror=alert(1)>',
    settings: { width: '1080"><script>', texture: 'evil', fonts: { title: { family: "x'); alert(1); ('", size: 50 } }, watermark: { color: 'red;"><script>', anchor: 'zz' }, border: { color: evil } },
    project: {
      title: 'T', characters: [{ id: 'c1', name: 'A', color: evil, images: [{ id: 'v1', assetId: 'a1', emotion: 'happy', transform: { plateColor: evil, plate: 'circle' } }] }],
      pages: [{ id: 'p1', kind: 'content', panels: [{ id: 'pn1', x: '0" onclick="x', y: 0, w: 500, h: 500, bgImage: 'a1', background: { kind: 'cafe' }, items: [
        { id: 'i1', type: 'character', charId: 'c1', x: 100, y: 400, size: 200, aspect: 0.66 },
        { id: 'i2"><script>', type: 'bubble', text: 'x' },
        { id: 'b1', type: 'bubble', kind: 'speech', text: '<script>alert(1)</script>', x: 10, y: 10, w: 100, h: 50, tailTo: 'i1' },
      ] }], texts: [] }],
    },
  });
  assert.equal(ep.settings.width, 1080);
  assert.equal(ep.settings.texture, 'clean');
  assert.equal(ep.settings.fonts.title.family, 'Black Han Sans');
  assert.equal(ep.settings.watermark.color, '#1b1f2a');
  assert.equal(ep.project.characters[0].color, '#868e96');
  assert.equal(ep.project.pages[0].panels[0].x, 0);
  assert.equal(ep.project.pages[0].panels[0].items.length, 2, 'ID 가 이상한 항목은 버림');
  assert.equal(sanitizeAsset({ id: 'a1', url: 'javascript:alert(1)', w: 10, h: 10 }), null);
  assert.equal(sanitizeAsset({ id: 'a1', url: 'data:image/svg+xml;base64,PHN2Zz4=', w: 10, h: 10 }), null);
  assert.equal(sanitizeAsset({ id: 'a1', url: `data:image/png;base64,AAAA${evil}`, w: 10, h: 10 }), null);
  const a1 = sanitizeAsset({ id: 'a1', url: 'data:image/png;base64,iVBORw0KGgo=', w: 10, h: 10 });
  assert.ok(a1);
  const { inner } = renderPage(ep.project.pages[0], { project: ep.project, settings: ep.settings, assets: { a1: { ...a1, url: `data:image/png;base64,AA${evil}` } }, index: 0, total: 1, opts: { guides: true } });
  assert.doesNotMatch(inner, /onload=|onclick=|onerror=|<script/i);
});
