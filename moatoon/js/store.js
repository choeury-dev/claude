// 이 브라우저 안의 저장소.
//  - IndexedDB: 회차(episodes), 업로드 이미지(assets). 이미지는 커서 localStorage(약 5MB)에 넣지 않는다.
//  - localStorage: 기본 설정, 등록한 레이아웃, API 키 같은 작은 값.
// 브라우저 저장소를 쓸 수 없는 환경(사생활 보호 창 등)에서는 메모리에만 두고 계속 동작한다.

const DB = 'moatoon-studio';
const VER = 1;
const mem = { episodes: new Map(), assets: new Map() };
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('episodes')) db.createObjectStore('episodes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function put(store, value) {
  mem[store].set(value.id, value);
  try { await tx(store, 'readwrite', (s) => s && s.put(value)); } catch { /* 메모리에는 남는다 */ }
  return value;
}
export async function get(store, id) {
  try {
    const v = await tx(store, 'readonly', (s) => (s ? req2p(s.get(id)) : null));
    if (v) return v;
  } catch { /* */ }
  return mem[store].get(id) || null;
}
export async function all(store) {
  try {
    const v = await tx(store, 'readonly', (s) => (s ? req2p(s.getAll()) : null));
    if (v) { for (const x of v) mem[store].set(x.id, x); return v; }
  } catch { /* */ }
  return [...mem[store].values()];
}
export async function del(store, id) {
  mem[store].delete(id);
  try { await tx(store, 'readwrite', (s) => s && s.delete(id)); } catch { /* */ }
}

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* */ }
}

// 이미지 파일 → { id, url(dataURL), w, h, name }. 너무 크면 긴 변 2000px 로 줄인다(원본 비율 유지).
export function readImage(file, maxSide = 2000) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        let url = fr.result;
        const k = Math.min(1, maxSide / Math.max(w, h));
        if (k < 1) {
          const c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          url = c.toDataURL(/png|gif|webp/.test(file.type) ? 'image/png' : 'image/jpeg', 0.92);
          w = c.width; h = c.height;
        }
        resolve({ id: `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url, w, h, name: file.name });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
