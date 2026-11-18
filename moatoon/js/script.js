// 장면 스크립트를 장면 목록으로 바꾼다.
//
//   제목: 월요일 아침
//   #1 카페, 아침
//   민지(기쁨): 오늘 커피는 내가 살게!
//   준호(속마음): 뭔가 수상한데...
//   (민지가 손을 흔든다)
//   내레이션: 그날 오후...

import {
  EMOTIONS, ACTIONS, BACKGROUNDS, NIGHT_WORDS,
  MONOLOGUE_WORDS, SHOUT_WORDS, WHISPER_WORDS,
} from './catalog.js';
import { isPageScript, parseEpisode } from './episode.js';

const SCENE_RE = /^(?:#|장면|씬|S#)\s*\d*\s*[.:：)\]-]?\s*(.*)$/;
const TITLE_RE = /^제목\s*[:：]\s*(.+)$/;
const EPISODE_RE = /^회차\s*[:：]\s*(.+)$/;
const SUBTITLE_RE = /^부제\s*[:：]\s*(.+)$/;
const SUMMARY_RE = /^요약\s*[:：]\s*(.+)$/;
const CLOSING_RE = /^마무리\s*[:：]\s*(.+)$/;
const MARK_RE = /^\[\s*(표지|마지막|요약|마지막 ?페이지)\s*\]$/;
const BG_RE = /^배경\s*[:：]\s*(.+)$/;
const NARR_RE = /^(?:내레이션|나레이션|해설|N)\s*[:：]\s*(.+)$/;
const ACTION_RE = /^(?:\((.+)\)|\*\s*(.+)|지문\s*[:：]\s*(.+))$/;
const LINE_RE = /^([^:：()\s][^:：()]{0,11}?)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)$/;

const has = (text, words) => words.some((w) => text.includes(w));

export function findEmotion(text) {
  if (!text) return null;
  for (const e of EMOTIONS) if (has(text, e.words)) return e.id;
  return null;
}

export function findAction(text) {
  if (!text) return null;
  for (const a of ACTIONS) if (has(text, a.words)) return a.id;
  return null;
}

export function findBackground(text) {
  const t = text || '';
  let kind = 'none';
  for (const b of BACKGROUNDS) if (b.words.length && has(t, b.words)) { kind = b.id; break; }
  return { kind, night: has(t, NIGHT_WORDS), label: t.trim() };
}

// 대사 끝 모양으로 감정을 짐작한다 (명시된 감정이 없을 때만).
function emotionFromText(text) {
  if (/\?!|!\?/.test(text)) return 'surprised';
  if (/ㅠ|ㅜ/.test(text)) return 'sad';
  if (/ㅋㅋ|ㅎㅎ|하하/.test(text)) return 'happy';
  return null;
}

function bubbleKind(mod, text) {
  if (has(mod, MONOLOGUE_WORDS)) return 'thought';
  if (has(mod, WHISPER_WORDS)) return 'whisper';
  if (has(mod, SHOUT_WORDS) || /!!+\s*$/.test(text)) return 'shout';
  return 'speech';
}

function newScene(desc) {
  return { desc, background: findBackground(desc), lines: [], cast: [], notes: [] };
}

export function parseScript(text, knownNames = []) {
  // "1페이지 · 표지" 같은 페이지형 제작 대본은 따로 해석한다(episode.js)
  if (isPageScript(text)) return parseEpisode(text, knownNames);
  const out = { title: '', episode: '', subtitle: '', summary: [], closing: '', scenes: [], characters: [], warnings: [] };
  let section = 'content'; // [마지막] 다음 줄은 요약으로 본다
  const names = new Set(knownNames);
  let scene = null;
  let pending = null; // 이름 없는 지문: 다음에 나오는 인물에게 준다
  const cur = () => {
    if (!scene) { scene = newScene(''); out.scenes.push(scene); }
    return scene;
  };
  const member = (sc, name) => {
    let c = sc.cast.find((m) => m.name === name);
    if (!c) {
      c = { name, emotion: null, action: null };
      sc.cast.push(c);
      if (pending) { Object.assign(c, pending); pending = null; }
    }
    if (!names.has(name)) names.add(name);
    if (!out.characters.includes(name)) out.characters.push(name);
    return c;
  };

  const rows = String(text || '').split(/\r?\n/);
  rows.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    let m;
    if ((m = line.match(TITLE_RE))) { out.title = m[1].trim(); return; }
    if ((m = line.match(EPISODE_RE))) { out.episode = m[1].trim(); return; }
    if ((m = line.match(SUBTITLE_RE))) { out.subtitle = m[1].trim(); return; }
    if ((m = line.match(SUMMARY_RE))) { out.summary.push(m[1].trim()); return; }
    if ((m = line.match(CLOSING_RE))) { out.closing = m[1].trim(); return; }
    if ((m = line.match(MARK_RE))) { section = m[1] === '표지' ? 'cover' : 'ending'; return; }
    if (section === 'ending') { out.summary.push(line.replace(/^[-•*·]\s*/, '')); return; }
    if ((m = line.match(SCENE_RE))) {
      section = 'content';
      scene = newScene(m[1].trim());
      out.scenes.push(scene);
      pending = null;
      return;
    }
    if ((m = line.match(BG_RE))) {
      const sc = cur();
      sc.desc = m[1].trim();
      sc.background = findBackground(sc.desc);
      return;
    }
    if ((m = line.match(NARR_RE))) {
      cur().lines.push({ kind: 'narration', speaker: null, text: m[1].trim(), row: i + 1 });
      return;
    }
    const act = line.match(ACTION_RE);
    const dlg = act ? null : line.match(LINE_RE);
    if (dlg) {
      const sc = cur();
      const speaker = dlg[1].trim();
      const mod = (dlg[2] || '').trim();
      const body = dlg[3].trim();
      const c = member(sc, speaker);
      const emo = findEmotion(mod) || emotionFromText(body);
      if (emo) c.emotion = emo;
      const a = findAction(mod);
      if (a) c.action = a;
      sc.lines.push({ kind: bubbleKind(mod, body), speaker, text: body, row: i + 1 });
      return;
    }
    // 지문 또는 장면 설명
    const desc = act ? (act[1] || act[2] || act[3]).trim() : line;
    const sc = cur();
    sc.notes.push(desc);
    if (sc.background.kind === 'none') {
      const bg = findBackground(desc);
      if (bg.kind !== 'none') sc.background = { ...bg, label: sc.desc || desc };
    }
    const action = findAction(desc);
    const emotion = findEmotion(desc);
    const mentioned = [...names].filter((n) => desc.includes(n));
    if (mentioned.length) {
      for (const n of mentioned) {
        const c = member(sc, n);
        if (action) c.action = action;
        if (emotion) c.emotion = emotion;
      }
    } else if (action || emotion) {
      const last = [...sc.lines].reverse().find((l) => l.speaker);
      if (last) {
        const c = member(sc, last.speaker);
        if (action) c.action = action;
        if (emotion) c.emotion = emotion;
      } else {
        pending = { ...(action && { action }), ...(emotion && { emotion }) };
      }
    }
  });

  if (!out.scenes.length) out.warnings.push('장면이 없습니다. "#1 카페" 처럼 # 으로 장면을 시작해 보세요.');
  return out;
}
