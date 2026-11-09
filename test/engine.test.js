import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { parseUtterance } from '../src/parse.js';

const names = (state, results) => results.map((r) => [r.memo.text, r.category]);

test('마침표로 항목을 나누고 끝의 트리거를 뗀다', () => {
  const p = parseUtterance('리무버. 케찹 살 것', ['살 것']);
  assert.deepEqual(p.items, ['리무버', '케찹']);
  assert.equal(p.trigger, '살 것');
});

test('쉼표, 그리고, 이랑 으로 나눈다', () => {
  assert.deepEqual(parseUtterance('우유, 계란 그리고 두부', []).items, ['우유', '계란', '두부']);
  assert.deepEqual(parseUtterance('케찹이랑 리무버 사야 돼', ['사야 돼']).items, ['케찹', '리무버']);
});

test('"카테고리: 내용" 은 명시적 카테고리', () => {
  const p = parseUtterance('여행 준비: 여권, 충전기', []);
  assert.equal(p.explicitCategory, '여행 준비');
  assert.deepEqual(p.items, ['여권', '충전기']);
});

test('예시: 등록된 "살 것" 이 있으면 "리무버. 케찹" 이 자동으로 들어간다', () => {
  const s = E.createState();
  E.addCategory(s, '살 것');
  assert.deepEqual(names(s, E.capture(s, '리무버. 케찹')), [['리무버', '살 것'], ['케찹', '살 것']]);
});

test('사용자 트리거로 분류하고 그 단어를 학습한다', () => {
  const s = E.createState();
  E.addCategory(s, '캠핑', { triggers: ['캠핑 갈 때'] });
  assert.deepEqual(names(s, E.capture(s, '랜턴, 버너 캠핑 갈 때')), [['랜턴', '캠핑'], ['버너', '캠핑']]);
  // 다음엔 트리거 없이도
  const r = E.classify(s, '랜턴');
  assert.equal(r.category.name, '캠핑');
  assert.equal(r.reason, 'learned');
});

test('등록 안 된 카테고리는 미분류 + 추천, accept 하면 만들어서 옮긴다', () => {
  const s = E.createState();
  const res = E.capture(s, '치과 예약하기. 세탁소 맡긴 옷 찾기');
  assert.ok(res.every((r) => r.category === E.UNCATEGORIZED && r.memo.suggestedCategory === '할 일'));

  const groups = E.suggestions(s);
  assert.equal(groups[0].name, '할 일');
  assert.equal(groups[0].exists, false);

  const { moved } = E.acceptSuggestion(s, '할 일');
  assert.equal(moved.length, 2);
  assert.equal(E.grouped(s).get('할 일').length, 2);
  assert.equal(E.grouped(s).get(E.UNCATEGORIZED).length, 0);
});

test('단서가 없으면 미분류, 옮기면 학습해서 다음부터 자동', () => {
  const s = E.createState();
  const [r] = E.capture(s, '모나미 볼펜');
  assert.equal(r.category, E.UNCATEGORIZED);
  assert.equal(r.memo.suggestedCategory, null);

  E.moveMemo(s, r.memo.id, '살 것');
  assert.equal(E.classify(s, '모나미 볼펜').category.name, '살 것');
});

test('같은 단어를 다른 카테고리로 옮기면 최근 결정이 이긴다', () => {
  const s = E.createState();
  const [r] = E.capture(s, '살 것: 우유');
  E.moveMemo(s, r.memo.id, '냉장고');
  assert.equal(E.classify(s, '우유').category.name, '냉장고');
});

test('날짜·시간 표현은 일정으로 추천', () => {
  const s = E.createState();
  const [r] = E.capture(s, '내일 3시 치과');
  assert.equal(r.memo.suggestedCategory, '일정');
});

test('같은 카테고리의 안 끝난 같은 항목은 중복으로 만들지 않는다', () => {
  const s = E.createState();
  E.addCategory(s, '살 것');
  E.capture(s, '케찹');
  const [r] = E.capture(s, '케찹 사야 돼');
  assert.equal(r.duplicate, true);
  assert.equal(s.memos.length, 1);
});
