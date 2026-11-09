// Node용 저장소: JSON 파일 하나. 앱 단계에서는 이 부분만 기기 저장소로 바꾸면 된다.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createState } from './engine.js';

export const DEFAULT_PATH = resolve(process.env.MODEORA_DB ?? 'data/modeora.json');

export function load(path = DEFAULT_PATH) {
  if (!existsSync(path)) return createState();
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function save(state, path = DEFAULT_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, path); // 쓰다가 죽어도 기존 파일이 깨지지 않도록
}
