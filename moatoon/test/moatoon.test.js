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
