#!/usr/bin/env node
// 모더라 텍스트 테스트용 CLI.
//   node src/cli.js                → 대화형: 그냥 치면 기록, /로 시작하면 명령
//   node src/cli.js add 리무버. 케찹  → 한 번만 실행
import { createInterface } from 'node:readline';
import * as E from './engine.js';
import { load, save, DEFAULT_PATH } from './fileStore.js';

const HELP = `
그냥 문장을 입력하면 기록·분류합니다.   예) 리무버. 케찹
  /list [카테고리]          카테고리별 메모 보기
  /cats                     카테고리 목록 (트리거·학습 단어)
  /cat <이름> [트리거,...]   카테고리 등록      예) /cat 살 것
  /suggest                  미분류 메모의 추천 카테고리
  /accept <이름>            추천 받아들이기     예) /accept 할 일
  /move <id> <카테고리>      메모 옮기기(+학습)
  /done <id>  /rm <id>      완료 처리 / 삭제
  /reset                    전부 지우기
  /help  /quit`;

const short = (id) => id.slice(-6);

function printCaptured(results) {
  for (const { memo, category, why, duplicate } of results) {
    if (duplicate) { console.log(`  = [${category}] ${memo.text}   ← 이미 있어서 건너뜀  #${short(memo.id)}`); continue; }
    const extra = memo.suggestedCategory ? `  (추천: ${memo.suggestedCategory})` : '';
    console.log(`  ✓ [${category}] ${memo.text}${extra}   ← ${why}  #${short(memo.id)}`);
  }
}

function printList(state, only) {
  for (const [name, memos] of E.grouped(state)) {
    if (only && name !== only) continue;
    if (!memos.length && !only) continue;
    console.log(`■ ${name} (${memos.length})`);
    for (const m of memos) console.log(`   - ${m.text}  #${short(m.id)}`);
  }
}

function resolveId(state, s) {
  // 화면에 보이는 6자리 꼬리로도 찾을 수 있게
  const hit = state.memos.filter((m) => m.id.endsWith(s) || m.id.startsWith(s));
  if (hit.length !== 1) throw new Error(hit.length ? `"${s}" 이(가) 여러 메모와 겹칩니다` : `"${s}" 메모가 없습니다`);
  return hit[0].id;
}

export function run(state, line) {
  line = line.trim();
  if (!line) return;
  if (!line.startsWith('/')) return printCaptured(E.capture(state, line));

  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd) {
    case 'list': return printList(state, arg || null);
    case 'cats':
      if (!state.categories.length) return console.log('  등록된 카테고리가 없습니다. 예) /cat 살 것');
      for (const c of state.categories) console.log(`■ ${c.name}\n   트리거: ${c.triggers.join(', ')}\n   학습 단어: ${c.keywords.join(', ') || '-'}`);
      return;
    case 'cat': {
      // "/cat 살 것" 처럼 이름에 공백이 있을 수 있어 트리거는 쉼표 뒤로 받는다: /cat 볼 것, 봐야지, 읽을 것
      const [name, ...triggers] = arg.split(',').map((s) => s.trim()).filter(Boolean);
      if (!name) throw new Error('이름이 필요합니다. 예) /cat 살 것');
      const c = E.addCategory(state, name, { triggers });
      return console.log(`  카테고리 "${c.name}" (트리거: ${c.triggers.join(', ')})`);
    }
    case 'suggest': {
      const s = E.suggestions(state);
      if (!s.length) return console.log('  미분류 메모가 없습니다.');
      for (const g of s) {
        const label = g.name ? `${g.name}${g.exists ? '' : ' (새 카테고리)'}` : '추천 없음';
        console.log(`■ ${label}: ${g.memos.map((m) => m.text).join(', ')}`);
      }
      console.log('  → /accept <이름> 으로 한꺼번에 옮기거나 /move <id> <카테고리>');
      return;
    }
    case 'accept': {
      const { category, moved } = E.acceptSuggestion(state, arg);
      return console.log(`  "${category.name}"(으)로 ${moved.length}개 옮김: ${moved.map((m) => m.text).join(', ')}`);
    }
    case 'move': {
      const [id, ...name] = rest;
      const { memo, category } = E.moveMemo(state, resolveId(state, id), name.join(' '));
      return console.log(`  "${memo.text}" → ${category.name} (다음부터 자동 분류)`);
    }
    case 'done': return console.log(`  완료: ${E.setDone(state, resolveId(state, arg)).text}`);
    case 'rm': return console.log(`  삭제: ${E.removeMemo(state, resolveId(state, arg)).text}`);
    case 'reset': Object.assign(state, E.createState()); return console.log('  초기화했습니다.');
    case 'help': return console.log(HELP);
    default: throw new Error(`모르는 명령: /${cmd}  (/help)`);
  }
}

function safeRun(state, line) {
  try {
    run(state, line);
    save(state);
  } catch (e) {
    console.log(`  ! ${e.message}`);
  }
}

const argv = process.argv.slice(2);
if (argv.length) {
  const state = load();
  const [cmd, ...rest] = argv;
  safeRun(state, cmd === 'add' ? rest.join(' ') : `/${argv.join(' ')}`);
} else {
  const state = load();
  console.log(`모더라 텍스트 테스트 (저장 위치: ${DEFAULT_PATH})${HELP}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    if (/^\/(quit|exit|q)$/.test(line.trim())) return rl.close();
    safeRun(state, line);
    rl.prompt();
  });
}
