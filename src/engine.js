// 모더라 핵심 로직: 저장 형식에 의존하지 않는 순수 JS (Node CLI와 모바일 앱에서 같이 쓰기 위함).
import { HINTS } from './hints.js';
import { normalize, parseUtterance } from './parse.js';

export const UNCATEGORIZED = '미분류';

export function createState() {
  return { version: 1, categories: [], memos: [] };
}

let seq = 0;
function makeId(prefix) {
  seq = (seq + 1) % 1296;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

// ── 카테고리 ────────────────────────────────────────────────

export function findCategory(state, name) {
  const n = normalize(name);
  return state.categories.find((c) => normalize(c.name) === n) ?? null;
}

export function addCategory(state, name, { triggers = [], keywords = [], now = new Date() } = {}) {
  const existing = findCategory(state, name);
  if (existing) {
    for (const t of triggers) if (!existing.triggers.includes(t)) existing.triggers.push(t);
    for (const k of keywords) learnKeyword(state, existing, k);
    return existing;
  }
  // 같은 이름의 힌트가 있으면 그 트리거를 기본값으로 가져온다 ("살 것" 등록 시 "사야 돼"도 인식)
  const hint = HINTS.find((h) => normalize(h.name) === normalize(name));
  const cat = {
    id: makeId('cat'),
    name: name.trim(),
    triggers: [...new Set([name.trim(), ...(hint?.triggers ?? []), ...triggers])],
    keywords: [],
    createdAt: now.toISOString(),
  };
  state.categories.push(cat);
  for (const k of keywords) learnKeyword(state, cat, k);
  return cat;
}

/** 키워드를 한 카테고리에만 두도록 다른 카테고리에서는 지운다 (가장 최근 결정이 이김) */
function learnKeyword(state, category, text) {
  const k = normalize(text);
  if (!k) return;
  for (const c of state.categories) {
    if (c !== category) c.keywords = c.keywords.filter((x) => x !== k);
  }
  if (!category.keywords.includes(k)) category.keywords.push(k);
}

// ── 분류 ───────────────────────────────────────────────────

function keywordMatch(itemNorm, keyword) {
  const k = normalize(keyword);
  if (!k) return false;
  return itemNorm === k || (k.length >= 2 && itemNorm.includes(k));
}

function triggerOwner(list, trigger) {
  if (!trigger) return null;
  const t = normalize(trigger);
  return list.find((c) => c.triggers.some((x) => normalize(x) === t)) ?? null;
}

/** 힌트 사전으로 추천 카테고리 이름을 고른다 (트리거 > 패턴 > 키워드) */
function hintFor(item, trigger) {
  const byTrigger = triggerOwner(HINTS, trigger);
  if (byTrigger) return { name: byTrigger.name, why: `"${trigger}"` };
  for (const h of HINTS) {
    for (const re of h.patterns) {
      const m = item.match(re);
      if (m) return { name: h.name, why: `표현 "${m[0].trim()}"` };
    }
  }
  const n = normalize(item);
  for (const h of HINTS) {
    const k = h.keywords.find((kw) => keywordMatch(n, kw));
    if (k) return { name: h.name, why: `단어 "${k}"` };
  }
  return null;
}

/**
 * 항목 하나의 카테고리를 결정한다. 상태는 바꾸지 않는다.
 * 우선순위: 명시(카테고리:) > 사용자 트리거 > 사용자 키워드(학습) > 힌트(등록된 카테고리면 배정, 아니면 추천만)
 */
export function classify(state, item, { explicitCategory = null, trigger = null } = {}) {
  if (explicitCategory) {
    const cat = findCategory(state, explicitCategory);
    return { category: cat, createName: cat ? null : explicitCategory, reason: 'explicit', confidence: 'high', why: `"${explicitCategory}:"` };
  }

  const byTrigger = triggerOwner(state.categories, trigger);
  if (byTrigger) return { category: byTrigger, reason: 'trigger', confidence: 'high', why: `"${trigger}"` };

  const n = normalize(item);
  for (const c of state.categories) {
    const k = c.keywords.find((kw) => keywordMatch(n, kw));
    if (k) return { category: c, reason: 'learned', confidence: 'high', why: `학습한 단어 "${k}"` };
  }

  const hint = hintFor(item, trigger);
  if (hint) {
    const cat = findCategory(state, hint.name);
    if (cat) return { category: cat, reason: 'hint', confidence: 'medium', why: hint.why };
    return { category: null, suggested: hint.name, reason: 'hint', confidence: 'low', why: hint.why };
  }

  return { category: null, suggested: null, reason: 'none', confidence: 'none', why: '단서 없음' };
}

function allTriggers(state) {
  return [...state.categories.flatMap((c) => c.triggers), ...HINTS.flatMap((h) => h.triggers)];
}

// ── 기록 ───────────────────────────────────────────────────

/**
 * 발화 하나를 기록한다. 항목마다 메모 1개씩 만든다.
 * @returns {Array<object>} 새로 만든 메모 + 분류 근거
 */
export function capture(state, raw, { source = 'text', now = new Date() } = {}) {
  const parsed = parseUtterance(raw, allTriggers(state), { isKnown: (t) => isKnownItem(state, t) });
  const captureId = makeId('cap');
  const created = [];

  for (const item of parsed.items) {
    const r = classify(state, item, parsed);
    let category = r.category;
    if (!category && r.createName) category = addCategory(state, r.createName, { now });

    // 사용자가 직접 말한 경우(명시/트리거)에는 이 단어를 학습해 다음엔 트리거 없이도 분류한다
    if (category && (r.reason === 'explicit' || r.reason === 'trigger')) learnKeyword(state, category, item);

    // 같은 카테고리(미분류 포함)에 아직 안 끝낸 같은 항목이 있으면 새로 만들지 않고 알려 준다.
    // 사용자가 그래도 추가하려면 addMemo 로 넣는다.
    const categoryId = category?.id ?? null;
    const dup = findOpenDuplicate(state, item, categoryId);
    if (dup) {
      created.push({ memo: dup, category: category?.name ?? UNCATEGORIZED, why: '이미 등록된 기록', duplicate: true });
      continue;
    }

    const memo = newMemo({ text: item, raw, captureId, categoryId, source, now });
    memo.suggestedCategory = category ? null : r.suggested ?? null;
    memo.reason = r.reason;
    memo.confidence = r.confidence;
    state.memos.push(memo);
    created.push({ memo, category: category?.name ?? UNCATEGORIZED, why: r.why });
  }
  return created;
}

function newMemo({ text, raw, captureId, categoryId, source, now }) {
  return {
    id: makeId('m'),
    captureId: captureId ?? makeId('cap'),
    text,
    raw: raw ?? text,
    categoryId,
    suggestedCategory: null,
    reason: 'manual',
    confidence: 'high',
    source,
    done: false,
    createdAt: now.toISOString(),
  };
}

/** 같은 카테고리에서 아직 완료하지 않은 같은 항목 (완료한 건 다시 사야 할 수 있으니 중복으로 보지 않는다) */
export function findOpenDuplicate(state, text, categoryId) {
  const n = normalize(text);
  return state.memos.find((m) => !m.done && m.categoryId === categoryId && normalize(m.text) === n) ?? null;
}

/**
 * 분류 없이 지정한 카테고리에 바로 넣는다. 중복 안내 후 "추가"를 눌렀을 때 쓴다.
 * @param {string|null} categoryNameToUse null 또는 '미분류' 면 미분류
 */
export function addMemo(state, text, categoryNameToUse, { source = 'text', now = new Date() } = {}) {
  const cat = !categoryNameToUse || categoryNameToUse === UNCATEGORIZED ? null : addCategory(state, categoryNameToUse, { now });
  const memo = newMemo({ text: text.trim(), categoryId: cat?.id ?? null, source, now });
  state.memos.push(memo);
  return { memo, category: cat?.name ?? UNCATEGORIZED };
}

const HINT_KEYWORDS = new Set(HINTS.flatMap((h) => h.keywords.map(normalize)));

/** 이 단어(구)를 이미 아는가: 사용자가 학습시킨 단어이거나 내장 사전에 있는 단어. 띄어쓰기로 나눌지 판단할 때 쓴다. */
export function isKnownItem(state, text) {
  const n = normalize(text);
  if (!n) return false;
  return HINT_KEYWORDS.has(n) || state.categories.some((c) => c.keywords.includes(n));
}

// ── 조회·정리 ───────────────────────────────────────────────

export function categoryName(state, memo) {
  return state.categories.find((c) => c.id === memo.categoryId)?.name ?? UNCATEGORIZED;
}

/** 카테고리별로 묶은 메모 목록 (미분류는 맨 뒤) */
export function grouped(state, { includeDone = false } = {}) {
  const groups = new Map(state.categories.map((c) => [c.name, []]));
  groups.set(UNCATEGORIZED, []);
  for (const m of state.memos) {
    if (!includeDone && m.done) continue;
    groups.get(categoryName(state, m)).push(m);
  }
  return groups;
}

export function findMemo(state, idPrefix) {
  const hits = state.memos.filter((m) => m.id === idPrefix || m.id.startsWith(idPrefix));
  if (hits.length !== 1) throw new Error(hits.length ? `"${idPrefix}"에 해당하는 메모가 여러 개입니다` : `"${idPrefix}" 메모가 없습니다`);
  return hits[0];
}

/** 메모를 다른 카테고리로 옮기고 그 단어를 학습한다. 없는 카테고리면 만든다. */
export function moveMemo(state, idPrefix, categoryNameToUse, { now = new Date() } = {}) {
  const memo = findMemo(state, idPrefix);
  const cat = addCategory(state, categoryNameToUse, { now });
  memo.categoryId = cat.id;
  memo.suggestedCategory = null;
  memo.reason = 'manual';
  memo.confidence = 'high';
  learnKeyword(state, cat, memo.text);
  return { memo, category: cat };
}

/** 미분류 메모를 추천 카테고리별로 묶는다 */
export function suggestions(state) {
  const out = new Map();
  for (const m of state.memos) {
    if (m.categoryId || m.done) continue;
    const key = m.suggestedCategory ?? null;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(m);
  }
  return [...out.entries()].map(([name, memos]) => ({ name, exists: name ? !!findCategory(state, name) : false, memos }));
}

/** 추천을 받아들인다: 카테고리를 만들고(없으면) 해당 미분류 메모를 모두 옮긴다 */
export function acceptSuggestion(state, name, { now = new Date() } = {}) {
  const targets = state.memos.filter((m) => !m.categoryId && !m.done && m.suggestedCategory && normalize(m.suggestedCategory) === normalize(name));
  if (!targets.length) throw new Error(`"${name}" 추천에 해당하는 미분류 메모가 없습니다`);
  const cat = addCategory(state, name, { now });
  for (const m of targets) {
    m.categoryId = cat.id;
    m.suggestedCategory = null;
    m.reason = 'accepted';
    learnKeyword(state, cat, m.text);
  }
  return { category: cat, moved: targets };
}

export function setDone(state, idPrefix, done = true) {
  const memo = findMemo(state, idPrefix);
  memo.done = done;
  return memo;
}

export function removeMemo(state, idPrefix) {
  const memo = findMemo(state, idPrefix);
  state.memos = state.memos.filter((m) => m !== memo);
  return memo;
}
