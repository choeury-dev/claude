// 앱 상태 훅: 1단계 엔진(../../src/engine.js)을 그대로 쓰고, 저장만 기기 저장소(AsyncStorage)로 바꾼다.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as E from '../../src/engine.js';

const KEY = 'modeora/state/v1';

export function useModeora() {
  const stateRef = useRef(E.createState());
  const [version, setVersion] = useState(0); // 엔진은 상태를 직접 바꾸므로, 화면 갱신용 카운터
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) stateRef.current = JSON.parse(raw);
      } catch {
        // 저장소를 못 읽어도 빈 상태로 시작한다
      }
      setReady(true);
      setVersion((v) => v + 1);
    })();
  }, []);

  /** 엔진 함수를 실행하고, 화면 갱신 + 저장. 엔진이 던진 오류는 호출한 쪽으로 넘긴다. */
  const act = useCallback((fn) => {
    const result = fn(stateRef.current);
    setVersion((v) => v + 1);
    AsyncStorage.setItem(KEY, JSON.stringify(stateRef.current)).catch(() => {});
    return result;
  }, []);

  return {
    ready,
    version,
    state: stateRef.current,
    capture: (text, source = 'text') => act((s) => E.capture(s, text, { source })),
    addMemo: (text, categoryName) => act((s) => E.addMemo(s, text, categoryName)),
    addCategory: (name, triggers = []) => act((s) => E.addCategory(s, name, { triggers })),
    moveMemo: (id, categoryName) => act((s) => E.moveMemo(s, id, categoryName)),
    acceptSuggestion: (name) => act((s) => E.acceptSuggestion(s, name)),
    toggleDone: (id, done) => act((s) => E.setDone(s, id, done)),
    removeMemo: (id) => act((s) => E.removeMemo(s, id)),
    clearDone: (categoryId) =>
      act((s) => {
        s.memos = s.memos.filter((m) => !(m.done && m.categoryId === categoryId));
      }),
  };
}
