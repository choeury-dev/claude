// 발화(텍스트) → 기억 항목 목록으로 쪼개기.

/** 비교용 정규화: 공백 제거, 소문자, 끝 문장부호·목적격 조사(을/를) 제거 */
export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[\s.,!?~·、。]+/g, '')
    .replace(/(을|를)$/, '');
}

/** "살 것" → /살\s*것/ 처럼 공백 유무에 관대한 정규식 조각 */
function phrasePattern(phrase) {
  return phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
}

/**
 * 문장 끝에 붙은 트리거 문구를 떼어낸다. 가장 긴 문구부터 검사한다.
 * @returns {{ text: string, trigger: string|null }}
 */
export function stripTrigger(text, triggers) {
  const sorted = [...new Set(triggers)].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    const re = new RegExp(`\\s*${phrasePattern(t)}\\s*[.!?]*$`);
    if (re.test(text)) {
      return { text: text.replace(re, '').trim(), trigger: t };
    }
  }
  return { text: text.trim(), trigger: null };
}

/**
 * 띄어쓰기만 있는 덩어리를 나눌지 정한다. 음성 받아쓰기는 마침표 없이 "리무버 케찹" 처럼 들어오기 때문.
 * - 덩어리 전체가 아는 단어면 그대로 둔다 ("모나미 볼펜"을 학습했다면 한 항목)
 * - 띄어쓴 낱말이 모두 아는 단어일 때만 나눈다 ("리무버 케찹" → 둘)
 * - 하나라도 모르는 낱말이 있으면 나누지 않는다 ("토마토 케찹", "모나미 볼펜"은 한 항목으로 둠)
 */
export function splitBySpaces(text, isKnown) {
  if (!isKnown || isKnown(text)) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || !words.every((w) => isKnown(w))) return [text];
  return words;
}

/**
 * 발화를 항목으로 나눈다.
 * - "카테고리: 내용" 형식이면 명시적 카테고리로 본다.
 * - 마침표·쉼표·줄바꿈, "그리고", "~이랑", "~하고" 로 나눈다.
 * - 띄어쓰기만 있으면, 낱말이 모두 아는 단어일 때만 나눈다 (splitBySpaces).
 * - 문장 끝 트리거 문구("살 것" 등)는 떼어서 따로 돌려준다.
 *
 * @param {string} raw
 * @param {string[]} triggers 인식할 트리거 문구 전체(사용자 + 힌트)
 * @returns {{ items: string[], explicitCategory: string|null, trigger: string|null }}
 */
export function parseUtterance(raw, triggers = [], { isKnown = null } = {}) {
  let text = raw.replace(/\s+/g, ' ').trim();
  let explicitCategory = null;

  const colon = text.match(/^([^:：]{1,15})[:：]\s*(.+)$/);
  if (colon) {
    explicitCategory = colon[1].trim();
    text = colon[2].trim();
  }

  // 발화 전체 끝의 트리거 ("리무버. 케찹 살 것" → "살 것")
  const whole = stripTrigger(text, triggers);
  text = whole.text;
  let trigger = whole.trigger;

  // "~이랑 ", "~하고 " 는 쉼표로 바꾼 뒤 나눈다 (Hermes 호환을 위해 lookbehind 미사용)
  const segments = text
    .replace(/(\S)(이랑|하고)\s+/g, '$1, ')
    .split(/[.,，、\n;]+|\s+그리고\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  for (const seg of segments) {
    // 항목마다 붙은 트리거 ("케찹 사야 돼. 리무버 사야 돼")
    const r = stripTrigger(seg, triggers);
    if (r.trigger && !trigger) trigger = r.trigger;
    if (r.text) items.push(...splitBySpaces(r.text, isKnown));
  }

  return { items, explicitCategory, trigger };
}
