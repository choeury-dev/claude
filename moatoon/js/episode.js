// 페이지형 제작 대본을 해석한다.
//
//   1페이지 · 표지
//   (설명) 시리즈 표기: … / 제목: … / 부제: …
//   2페이지 · 또 그 문의
//   모아의 책상 전경. 전화를 받는다.        ← 첫 컷 설명
//   고객: “부품을 겹쳐 끼웠는데…”            ← 대사(따옴표)
//   아래 컷은 모아의 손 클로즈업.             ← 새 컷
//   작은 독백: 또 여기네.                    ← 그 컷 인물의 생각 풍선
//   게시글: “…” / 댓글 1: “…” / 메모: “…”    ← 화면·물건에 적힌 글(글씨 상자)
//   나레이션: …                              ← 내레이션 상자
//   12페이지 · 저장용 요약                   ← 마지막(요약) 페이지
//   업무 스킬 한 뼘 성장하기 / 부제: … / 1. … / 하단 한 줄: …
//
// 상태:, 화면:, 배경: 같은 제작 메모는 그림에 넣지 않고 메모로만 남긴다.

import { findEmotion, findAction, findBackground } from './script.js';
import { MONOLOGUE_WORDS, SHOUT_WORDS, WHISPER_WORDS, BACKGROUNDS } from './catalog.js';

export const PAGE_RE = /^(\d{1,3})\s*(?:페이지|쪽|p|P)\s*(?:[·:：|.\-–—]\s*)?(.*)$/;
const CUT_WORDS = '(?:아래|다음|마지막|첫|위|페이지|작은|큰|두\\s?번째|세\\s?번째|오른쪽|왼쪽|아래쪽|위쪽|이어지는|이어서)';
const CUT_RE = new RegExp(`^(?:${CUT_WORDS}\\s*)+컷(?:은|에서는|에서|에는)?\\s*(?:[.:：,]\\s*)?(.*)$`);
const CUT_NUM_RE = /^(\d)\s*컷\s*[.:：)]\s*(.*)$/;
const KV_RE = /^([^:：“”"]{1,20}?)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)$/;
const ITEM_RE = /^(\d{1,2})[.)]\s*(.+)$/;

const NARRATION_KEYS = /^(나레이션|내레이션|해설|N)$/;
const THOUGHT_KEYS = /^(작은\s*독백|독백|속마음|생각|혼잣말|속말)$/;
// 화면·종이·물건에 적힌 글: 인물이 아니라 글씨 상자로 넣는다
const CAPTION_KEYS = /^(게시글(\s*제목)?|게시물|글\s*제목|댓글\s*\d*|대댓글\s*\d*|답글|메모|포스트잇|폴더명?|파일명|효과음|의성어|자막|문자|메시지|카톡|알림|간판|표지판|화면\s*(글씨|텍스트|문구)|검색어|제목\s*표시|라벨|안내문)$/;
// 그림에는 넣지 않는 제작 메모
const META_KEYS = /^(상태|화면|구도|연출|분위기|컬러|색|색감|레이아웃|참고|주의|비고|톤|스타일|디자인|그림|작가\s*메모|설명)$/;
const CLOSEUP_RE = /(얼굴|표정|눈)[^.]*?(클로즈업|가까이|확대)/; // 손·물건 클로즈업은 인물을 키우지 않는다
const NEW_CUT_HINT = /클로즈업|장면 전환|컷 전환/;
const BUST_RE = /상반신|바스트/;

const has = (text, words) => words.some((w) => text.includes(w));
const COLOR_WORDS = [['연두', '#74b816'], ['초록', '#2b8a3e'], ['남색', '#364fc7'], ['하늘', '#339af0'], ['파랑', '#1c7ed6'], ['파란', '#1c7ed6'], ['빨강', '#e03131'], ['빨간', '#e03131'], ['주황', '#f76707'], ['노랑', '#f59f00'], ['노란', '#f59f00'], ['보라', '#7048e8'], ['분홍', '#e64980'], ['회색', '#868e96'], ['검정', '#1b1f2a'], ['검은', '#1b1f2a']];
const colorWord = (s) => { const m = String(s).match(/[—–-]\s*(.+)$/); if (!m) return ''; const hit = COLOR_WORDS.find(([w]) => m[1].includes(w)); return hit ? hit[1] : ''; };
const unquote = (s) => s.trim().replace(/^[“"'‘]\s*/, '').replace(/\s*[”"'’]\s*\.?$/, '').trim();
const isQuoted = (s) => /^[“"'‘]/.test(s.trim());
const stripStyleNote = (s) => {
  const parts = s.split(/\s+[—–-]\s+/);
  const rest = parts.slice(1).join(' ');
  return (parts.length > 1 && /(색|글씨|폰트|크기|굵게|강조)/.test(rest) ? parts[0] : s).replace(/[.。]\s*$/, '').trim();
};

function pageKind(title, index, total) {
  if (/표지|커버/.test(title)) return 'cover';
  if (/요약|정리|마지막\s*페이지|저장용|마무리/.test(title)) return 'ending';
  return 'content';
}

function speechKind(mod, text) {
  if (has(mod, MONOLOGUE_WORDS)) return 'thought';
  if (has(mod, WHISPER_WORDS)) return 'whisper';
  if (has(mod, SHOUT_WORDS) || /!!+\s*$/.test(text)) return 'shout';
  return 'speech';
}

// 1차: 따옴표 대사를 하는 이름을 모은다 (띄어쓰기·숫자 없는 짧은 이름만)
function collectSpeakers(rows, known) {
  const names = new Set(known);
  for (const raw of rows) {
    const m = raw.trim().match(KV_RE);
    if (!m) continue;
    const key = m[1].trim();
    if (/\s|\d/.test(key) || key.length > 10) continue;
    if (NARRATION_KEYS.test(key) || THOUGHT_KEYS.test(key) || CAPTION_KEYS.test(key) || META_KEYS.test(key)) continue;
    if (/^(제목|회차|시리즈|부제|요약|마무리|배경)$/.test(key)) continue;
    if (isQuoted(m[3]) || m[2]) names.add(key);
  }
  return [...names];
}

export function isPageScript(text) {
  return String(text || '').split(/\r?\n/).some((l) => PAGE_RE.test(l.trim()));
}

export function parseEpisode(text, knownNames = []) {
  const rows = String(text || '').split(/\r?\n/);
  const speakers = collectSpeakers(rows, knownNames);
  const out = {
    title: '', episode: '', subtitle: '', summary: [], closing: '', endingHeading: '', endingSubtitle: '',
    scenes: [], pages: [], characters: [], notes: [], warnings: [],
  };
  let page = null;
  let cut = null;
  const seen = [];
  const remember = (n) => { if (!seen.includes(n)) seen.push(n); };

  const newCut = (desc = '') => {
    cut = { desc: desc ? [desc] : [], lines: [], notes: [], mods: {} };
    page.cuts.push(cut);
    return cut;
  };
  const curCut = () => cut || newCut();

  rows.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    let m;
    if ((m = line.match(PAGE_RE))) {
      page = { no: Number(m[1]), title: m[2].trim(), kind: pageKind(m[2]), cuts: [], notes: [], plain: [] };
      out.pages.push(page);
      cut = null;
      return;
    }
    if (!page) { out.notes.push(line); return; } // 첫 페이지 앞 설명은 메모로

    // 컷 나눔
    if (page.kind === 'content' && ((m = line.match(CUT_RE)) || (m = line.match(CUT_NUM_RE)))) {
      const rest = (m[m.length - 1] || '').trim();
      newCut(rest);
      return;
    }

    const kv = line.match(KV_RE);
    if (kv) {
      const key = kv[1].trim(), mod = (kv[2] || '').trim(), val = kv[3].trim();
      if (key === '제목') { out.title = val; return; }
      if (/^(회차|시리즈(\s*표기)?)$/.test(key)) { out.episode = stripStyleNote(val); out.episodeColor = colorWord(val); return; }
      if (key === '부제') { if (page.kind === 'ending') out.endingSubtitle = val; else out.subtitle = val; return; }
      if (key === '요약') { out.summary.push(val); return; }
      if (/^(마무리|하단\s*한\s*줄|맺음말|마지막\s*한\s*줄)$/.test(key)) { out.closing = val; return; }
      if (key === '배경') { curCut().bg = val; return; }
      if (META_KEYS.test(key)) { page.notes.push(`${key}: ${val}`); return; }
      if (page.kind === 'cover' || page.kind === 'ending') {
        if (NARRATION_KEYS.test(key) || CAPTION_KEYS.test(key)) { page.notes.push(line); return; }
      }
      if (NARRATION_KEYS.test(key)) { curCut().lines.push({ kind: 'narration', speaker: null, text: unquote(val), row: i + 1 }); return; }
      if (THOUGHT_KEYS.test(key)) { curCut().lines.push({ kind: 'thought', speaker: null, text: unquote(val), row: i + 1, attach: true }); return; }
      if (CAPTION_KEYS.test(key)) { curCut().lines.push({ kind: 'caption', speaker: null, label: key, text: unquote(val), row: i + 1 }); return; }
      if (speakers.includes(key)) {
        const c = curCut();
        const text = unquote(val);
        c.lines.push({ kind: speechKind(mod, text), speaker: key, text, row: i + 1, mod });
        if (mod) c.mods[key] = mod;
        remember(key);
        return;
      }
      // 모르는 '이름:' 줄은 대사로 보지 않고 설명으로 둔다
    }

    if (page.kind === 'ending') {
      if ((m = line.match(ITEM_RE))) { out.summary.push(`${m[1]}. ${m[2].trim()}`); page.inItems = true; return; }
      if (!page.inItems && !out.endingHeading) { out.endingHeading = line; return; }
      if (page.inItems) { out.summary.push(`  ${line}`); return; }
      out.summary.push(line);
      return;
    }
    if (page.kind === 'cover') { page.plain.push(line); return; }
    // 대사가 이미 있는 컷에 "…클로즈업." 같은 설명이 오면 새 컷으로 본다
    if (cut && cut.lines.length && NEW_CUT_HINT.test(line)) { newCut(line); return; }
    curCut().desc.push(line);
  });

  // 컷 정리: 설명에 나온 인물만 컷에 세우고, 나머지 화자는 화면 밖(꼬리 없는 말풍선)
  const finalizeCut = (c, pageTitle, lastOnscreen, pageMentioned) => {
    const desc = c.desc.join(' ');
    const pov = speakers.filter((n) => new RegExp(`${n}\\s*시점`).test(desc));
    const mentioned = speakers
      .filter((n) => desc.includes(n) && !pov.includes(n))
      .sort((a, b) => desc.indexOf(a) - desc.indexOf(b));
    const lineSpeakers = [...new Set(c.lines.filter((l) => l.speaker).map((l) => l.speaker))];
    // 같은 페이지 설명에 나온 인물이 말하면 화면 안, 페이지 어디에도 안 나오면(전화 속 상대 등) 화면 밖
    const castNames = mentioned.length ? [...mentioned, ...lineSpeakers.filter((n) => !mentioned.includes(n) && pageMentioned.has(n))] : lineSpeakers;
    const sentences = desc.split(/(?<=[.!?。])\s+/);
    const cast = castNames.map((name) => {
      const mine = sentences.filter((s) => s.includes(name)).join(' ');
      const myLines = c.lines.filter((l) => l.speaker === name);
      const emotion = findEmotion(c.mods[name] || '') || findEmotion(mine) || null;
      const action = findAction(c.mods[name] || '') || findAction(mine) || null;
      remember(name);
      return { name, emotion, action, lines: myLines.length };
    });
    for (const l of c.lines) {
      if (l.attach) l.speaker = cast[0]?.name || lastOnscreen || null;
      if (l.speaker && !castNames.includes(l.speaker)) l.offscreen = true;
    }
    const bg = findBackground(`${c.bg || ''} ${desc} ${pageTitle}`);
    const closeupSentence = sentences.find((s) => CLOSEUP_RE.test(s));
    const zoom = closeupSentence && cast.some((m) => closeupSentence.includes(m.name)) ? 1.8 : (BUST_RE.test(desc) && cast.length ? 1.35 : 1);
    return { desc: desc.slice(0, 300), background: { ...bg, label: bg.kind === 'none' ? '' : BACKGROUNDS.find((b) => b.id === bg.kind).label }, lines: c.lines, cast, notes: [], zoom };
  };

  for (const pg of out.pages) {
    if (pg.kind === 'content') {
      let last = null;
      const allDesc = pg.cuts.map((c) => c.desc.join(' ')).join(' ');
      const pageMentioned = new Set(speakers.filter((n) => new RegExp(`${n}(?!\\s*시점)`).test(allDesc))); // 'OO 시점'은 등장이 아님
      pg.scenes = pg.cuts.map((c) => {
        const sc = finalizeCut(c, pg.title, last, pageMentioned);
        if (sc.cast.length) last = sc.cast[0].name;
        // 장소 설명이 없는 컷은 같은 페이지 앞 컷의 장소를 이어받는다
        const prev = pg.scenesSoFar && pg.scenesSoFar[pg.scenesSoFar.length - 1];
        if (sc.background.kind === 'none' && prev && prev.background.kind !== 'none') sc.background = { ...prev.background };
        (pg.scenesSoFar = pg.scenesSoFar || []).push(sc);
        return sc;
      });
      if (!pg.scenes.length) pg.scenes = [{ desc: pg.title, background: findBackground(pg.title), lines: [], cast: [], notes: [], zoom: 1 }];
      out.scenes.push(...pg.scenes);
    } else if (pg.kind === 'cover') {
      const desc = pg.plain.join(' ');
      const names = speakers.filter((n) => desc.includes(n)).sort((a, b) => desc.indexOf(a) - desc.indexOf(b)).slice(0, 3);
      names.forEach(remember);
      const sentences = desc.split(/(?<=[.!?。])\s+/);
      // 인물마다 자기 이름이 나온 문장에서만 동작을 찾는다
      pg.scene = { desc, background: { kind: 'none', night: false, label: '' }, lines: [], notes: [], zoom: 1, cast: names.map((n) => ({ name: n, emotion: 'happy', action: findAction(sentences.filter((s) => s.includes(n) && names.filter((o) => s.includes(o)).length === 1).join(' ')) || 'stand' })) };
    }
    delete pg.cuts; delete pg.plain; delete pg.inItems; delete pg.scenesSoFar;
  }
  out.characters = seen;
  if (!out.pages.some((p) => p.kind === 'cover') && out.title) out.warnings.push('표지 페이지가 없어서 제목만 기억합니다.');
  return out;
}
