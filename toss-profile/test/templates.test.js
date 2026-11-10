import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, TEMPLATES, templatesOf, buildPrompt } from '../shared/templates.js';

test('카테고리는 여행·효도·명언·웃긴사진 4개, 각각 템플릿이 있다', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.title), ['여행', '효도', '명언', '웃긴사진']);
  for (const c of CATEGORIES) assert.ok(templatesOf(c.id).length >= 3, c.id);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test('모든 프롬프트에 얼굴 보존 규칙과 글자 금지가 들어간다', () => {
  for (const t of TEMPLATES) {
    const p = buildPrompt(t);
    assert.match(p, /IDENTITY LOCK/);
    assert.match(p, /Do not add any text/);
  }
});

test('명언 템플릿은 글귀 패널 자리를 비워 둔다', () => {
  for (const t of templatesOf('quote')) {
    assert.ok(t.overlay && t.overlay.lines.length > 0);
    assert.match(buildPrompt(t), /right 45%/);
  }
});
