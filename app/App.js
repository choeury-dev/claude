import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as E from '../src/engine.js';
import { useModeora } from './lib/useModeora';

const STARTER_CATEGORIES = ['살 것', '할 일', '일정'];

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const m = useModeora();
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState(null); // null = 전체, 아니면 카테고리 이름
  const [toast, setToast] = useState(null);
  const [moving, setMoving] = useState(null); // 옮길 메모
  const [addingCategory, setAddingCategory] = useState(false);
  const toastTimer = useRef(null);

  const groups = useMemo(() => [...E.grouped(m.state, { includeDone: true })], [m.version]);
  const suggestions = useMemo(() => E.suggestions(m.state).filter((g) => g.name), [m.version]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(content) {
    clearTimeout(toastTimer.current);
    setToast(content);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  function submit() {
    const text = input.trim();
    if (!text) return;
    const results = m.capture(text);
    setInput('');
    showToast(results);
  }

  if (!m.ready) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const visible = groups.filter(([name, memos]) => (filter ? name === filter : memos.length > 0));
  const isEmpty = m.state.memos.length === 0;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Text style={s.title}>모더라</Text>
          <Text style={s.subtitle}>말하면 기록하고, 알아서 나눠 둡니다</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsBar} contentContainerStyle={s.chips}>
          <Chip s={s} label="전체" active={!filter} onPress={() => setFilter(null)} />
          {groups.map(([name, memos]) => {
            const open = memos.filter((x) => !x.done).length;
            if (name === E.UNCATEGORIZED && !memos.length) return null;
            return <Chip key={name} s={s} label={`${name} ${open}`} active={filter === name} onPress={() => setFilter(filter === name ? null : name)} />;
          })}
          <Chip s={s} label="＋ 카테고리" onPress={() => setAddingCategory(true)} dashed />
        </ScrollView>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
          {m.state.categories.length === 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>먼저 카테고리를 하나 만들어 보세요</Text>
              <Text style={s.muted}>등록된 카테고리로 자동 분류합니다. 없는 건 미분류로 두고 추천해 드려요.</Text>
              <View style={[s.row, { marginTop: 12, gap: 8, flexWrap: 'wrap' }]}>
                {STARTER_CATEGORIES.map((name) => (
                  <Pressable key={name} style={s.btnSecondary} onPress={() => m.addCategory(name)}>
                    <Text style={s.btnSecondaryText}>＋ {name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {isEmpty && m.state.categories.length > 0 && (
            <Text style={[s.muted, { textAlign: 'center', marginTop: 24 }]}>
              아래에 "리무버. 케찹" 처럼 적어 보세요.
            </Text>
          )}

          {(!filter || filter === E.UNCATEGORIZED) &&
            suggestions.map((g) => (
              <View key={g.name} style={[s.card, s.suggestCard]}>
                <Text style={s.cardTitle}>
                  추천: <Text style={{ color: c.accent }}>{g.name}</Text>
                  {g.exists ? '' : '  (새 카테고리)'}
                </Text>
                <Text style={s.muted}>{g.memos.map((x) => x.text).join(', ')}</Text>
                <Pressable style={[s.btnPrimary, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={() => m.acceptSuggestion(g.name)}>
                  <Text style={s.btnPrimaryText}>{g.exists ? `${g.name}(으)로 옮기기` : `${g.name} 만들고 옮기기`}</Text>
                </Pressable>
              </View>
            ))}

          {visible.map(([name, memos]) => {
            const category = E.findCategory(m.state, name);
            const doneCount = memos.filter((x) => x.done).length;
            const sorted = [...memos].sort((a, b) => a.done - b.done || b.createdAt.localeCompare(a.createdAt));
            return (
              <View key={name} style={s.section}>
                <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                  <Text style={s.sectionTitle}>{name}</Text>
                  {doneCount > 0 && category && (
                    <Pressable onPress={() => m.clearDone(category.id)} hitSlop={8}>
                      <Text style={s.link}>완료 {doneCount}개 지우기</Text>
                    </Pressable>
                  )}
                </View>
                {sorted.length === 0 && <Text style={s.muted}>비어 있어요</Text>}
                {sorted.map((memo) => (
                  <MemoRow key={memo.id} s={s} memo={memo} onToggle={() => m.toggleDone(memo.id, !memo.done)} onPress={() => setMoving(memo)} />
                ))}
              </View>
            );
          })}
        </ScrollView>

        {toast && <CaptureToast s={s} results={toast} />}

        <SafeAreaView edges={['bottom']} style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="예) 리무버. 케찹"
            placeholderTextColor={c.muted}
            returnKeyType="done"
            onSubmitEditing={submit}
            submitBehavior="submit"
          />
          <Pressable style={[s.btnPrimary, !input.trim() && { opacity: 0.4 }]} onPress={submit} disabled={!input.trim()}>
            <Text style={s.btnPrimaryText}>기록</Text>
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <MoveSheet s={s} c={c} memo={moving} categories={m.state.categories} onClose={() => setMoving(null)}
        onMove={(name) => { m.moveMemo(moving.id, name); setMoving(null); }}
        onDelete={() => { m.removeMemo(moving.id); setMoving(null); }} />

      <CategorySheet s={s} c={c} visible={addingCategory} onClose={() => setAddingCategory(false)}
        onSave={(name, triggers) => { m.addCategory(name, triggers); setAddingCategory(false); }} />
    </SafeAreaView>
  );
}

function Chip({ s, label, active, onPress, dashed }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive, dashed && s.chipDashed]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MemoRow({ s, memo, onToggle, onPress }) {
  return (
    <View style={s.memoRow}>
      <Pressable onPress={onToggle} hitSlop={10} style={[s.check, memo.done && s.checkOn]} accessibilityRole="checkbox" accessibilityState={{ checked: memo.done }}>
        {memo.done && <Text style={s.checkMark}>✓</Text>}
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={onPress}>
        <Text style={[s.memoText, memo.done && s.memoDone]}>{memo.text}</Text>
        {memo.suggestedCategory && <Text style={s.mutedSmall}>추천: {memo.suggestedCategory}</Text>}
      </Pressable>
    </View>
  );
}

function CaptureToast({ s, results }) {
  // 카테고리별로 묶어서 "살 것 ← 리무버, 케찹" 형태로 보여준다
  const byCat = new Map();
  for (const r of results) {
    const key = r.category;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(r.duplicate ? `${r.memo.text}(이미 있음)` : r.memo.text);
  }
  return (
    <View style={s.toast} pointerEvents="none">
      {[...byCat].map(([cat, items]) => (
        <Text key={cat} style={s.toastText}>
          <Text style={{ fontWeight: '700' }}>{cat}</Text>  ←  {items.join(', ')}
        </Text>
      ))}
    </View>
  );
}

function Sheet({ s, visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <Text style={s.sheetTitle}>{title}</Text>
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MoveSheet({ s, c, memo, categories, onClose, onMove, onDelete }) {
  const [newName, setNewName] = useState('');
  useEffect(() => setNewName(''), [memo]);
  if (!memo) return null;
  return (
    <Sheet s={s} visible={!!memo} onClose={onClose} title={`"${memo.text}" 옮기기`}>
      <Text style={[s.muted, { marginBottom: 10 }]}>옮기면 이 단어를 기억해서 다음부터 자동으로 분류해요.</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
        {categories.map((cat) => (
          <Pressable key={cat.id} style={[s.btnSecondary, cat.id === memo.categoryId && { borderColor: c.accent }]} onPress={() => onMove(cat.name)}>
            <Text style={s.btnSecondaryText}>{cat.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, { marginTop: 12, gap: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={newName} onChangeText={setNewName} placeholder="새 카테고리 이름" placeholderTextColor={c.muted} />
        <Pressable style={[s.btnPrimary, !newName.trim() && { opacity: 0.4 }]} disabled={!newName.trim()} onPress={() => onMove(newName.trim())}>
          <Text style={s.btnPrimaryText}>만들기</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDelete} style={{ marginTop: 16, alignSelf: 'flex-start' }} hitSlop={8}>
        <Text style={[s.link, { color: c.danger }]}>메모 삭제</Text>
      </Pressable>
    </Sheet>
  );
}

function CategorySheet({ s, c, visible, onClose, onSave }) {
  const [name, setName] = useState('');
  const [triggers, setTriggers] = useState('');
  useEffect(() => { if (visible) { setName(''); setTriggers(''); } }, [visible]);
  const save = () => name.trim() && onSave(name.trim(), triggers.split(',').map((t) => t.trim()).filter(Boolean));
  return (
    <Sheet s={s} visible={visible} onClose={onClose} title="카테고리 추가">
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="이름  예) 캠핑 준비물" placeholderTextColor={c.muted} autoFocus />
      <TextInput style={[s.input, { marginTop: 8 }]} value={triggers} onChangeText={setTriggers}
        placeholder="끝맺음 말(선택, 쉼표로)  예) 캠핑 갈 때, 챙길 것" placeholderTextColor={c.muted} />
      <Text style={[s.mutedSmall, { marginTop: 6 }]}>"랜턴, 버너 캠핑 갈 때" 라고 말하면 이 카테고리로 들어가요.</Text>
      <Pressable style={[s.btnPrimary, { marginTop: 12 }, !name.trim() && { opacity: 0.4 }]} disabled={!name.trim()} onPress={save}>
        <Text style={s.btnPrimaryText}>추가</Text>
      </Pressable>
    </Sheet>
  );
}

function usePalette() {
  const dark = useColorScheme() === 'dark';
  return dark
    ? { dark, bg: '#121212', surface: '#1E1E1E', text: '#F2F2F2', muted: '#9A9A9A', border: '#333', accent: '#F28C52', accentText: '#1A0F08', danger: '#FF6B6B', suggest: '#2A2118' }
    : { dark, bg: '#FAF7F2', surface: '#FFFFFF', text: '#1C1B1A', muted: '#7A746C', border: '#E6E0D6', accent: '#D9622B', accentText: '#FFFFFF', danger: '#C62828', suggest: '#FFF3E9' };
}

function makeStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center' },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    title: { fontSize: 28, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
    chipsBar: { flexGrow: 0 },
    chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipDashed: { borderStyle: 'dashed' },
    chipText: { color: c.text, fontSize: 14 },
    chipTextActive: { color: c.accentText, fontWeight: '700' },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
    suggestCard: { backgroundColor: c.suggest, borderColor: c.accent },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    section: { backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.border },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    memoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12 },
    check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: c.accent, borderColor: c.accent },
    checkMark: { color: c.accentText, fontSize: 13, fontWeight: '800' },
    memoText: { fontSize: 16, color: c.text },
    memoDone: { color: c.muted, textDecorationLine: 'line-through' },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
    mutedSmall: { fontSize: 12, color: c.muted, marginTop: 2 },
    link: { fontSize: 13, color: c.accent, fontWeight: '600' },
    inputBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center' },
    input: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 16, color: c.text, backgroundColor: c.bg },
    btnPrimary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    btnPrimaryText: { color: c.accentText, fontWeight: '700', fontSize: 15 },
    btnSecondary: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    btnSecondaryText: { color: c.text, fontSize: 15 },
    toast: { position: 'absolute', left: 16, right: 16, bottom: 90, backgroundColor: c.dark ? '#2C2C2C' : '#1C1B1A', borderRadius: 12, padding: 12, gap: 4 },
    toastText: { color: '#FFFFFF', fontSize: 15 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6 },
  });
}
