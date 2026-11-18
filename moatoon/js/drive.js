// Google 드라이브 연동 (Google Identity Services 토큰 + Drive REST API v3).
// 필요한 것: Google Cloud 콘솔에서 만든 "OAuth 클라이언트 ID(웹 애플리케이션)".
//   승인된 JavaScript 원본에 이 앱을 여는 주소(예: http://localhost:8080)를 넣어야 한다.
// 권한: drive.readonly(내 드라이브의 스크립트 파일 읽기) + drive.file(이 앱이 만든 회차 파일 저장).

const GSI = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

export const MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc: 'application/vnd.google-apps.document',
};

let token = null;
let tokenExp = 0;

function loadGsi() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(Object.assign(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'), { code: 'script' }));
    document.head.appendChild(s);
  });
}

export function isConnected() { return !!token && Date.now() < tokenExp; }

export async function connect(clientId) {
  if (!clientId) throw new Error('Google OAuth 클라이언트 ID를 먼저 입력해 주세요.');
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(Object.assign(new Error(`Google 로그인 실패: ${resp.error}`), { code: resp.error === 'access_denied' ? 'denied' : 'login' })); return; }
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        resolve();
      },
      error_callback: (err) => reject(Object.assign(new Error(err && err.type === 'popup_closed' ? '로그인 창이 닫혔습니다.' : '로그인 창을 열지 못했습니다. 팝업 차단을 확인해 주세요.'), { code: err && err.type === 'popup_closed' ? 'closed' : 'popup' })),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

export function disconnect() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0;
}

async function call(url, init = {}) {
  if (!isConnected()) throw new Error('Google 드라이브 연결이 끊겼습니다. 다시 연결해 주세요.');
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) { token = null; throw new Error('Google 로그인이 만료되었습니다. 다시 연결해 주세요.'); }
  if (res.status === 403) throw new Error('이 파일에 접근할 권한이 없습니다. (이 앱이 만들지 않은 파일은 덮어쓸 수 없어 새 파일로 저장합니다)');
  if (!res.ok) throw new Error(`Google 드라이브 오류 (${res.status})`);
  return res;
}

// 폴더 주소(https://drive.google.com/drive/folders/XXXX)나 ID 에서 ID 만 꺼낸다
export function folderIdFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/folders\/([\w-]+)/) || t.match(/[?&]id=([\w-]+)/);
  return m ? m[1] : (/^[\w-]{10,}$/.test(t) ? t : '');
}

// 회차로 쓸 수 있는 파일과 폴더 목록: 구글 문서, .txt/.md, 저장한 .moatoon.json
export async function list(folderId) {
  const kinds = `mimeType = '${MIME.folder}' or mimeType = '${MIME.doc}' or mimeType = 'text/plain' or mimeType = 'text/markdown' or name contains '.moatoon.json'`;
  const q = `trashed = false and (${kinds})${folderId ? ` and '${folderId}' in parents` : ''}`;
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,modifiedTime,parents)', orderBy: 'folder,modifiedTime desc', pageSize: '200', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const res = await call(`${API}/files?${params}`);
  return (await res.json()).files || [];
}

export function kindOf(file) {
  if (file.mimeType === MIME.folder) return 'folder';
  if (/\.moatoon\.json$/i.test(file.name)) return 'episode';
  return 'script';
}

// 파일 내용 읽기: 구글 문서는 텍스트로 내보내고, 나머지는 그대로 받는다
export async function read(file) {
  const url = file.mimeType === MIME.doc
    ? `${API}/files/${file.id}/export?mimeType=text/plain`
    : `${API}/files/${file.id}?alt=media&supportsAllDrives=true`;
  const res = await call(url);
  return res.text();
}

// 회차 저장: fileId 가 있으면 그 파일을 덮어쓰고, 없으면 폴더에 새로 만든다
export async function save({ fileId, name, folderId, json }) {
  const body = JSON.stringify(json);
  if (fileId) {
    try {
      const res = await call(`${UPLOAD}/files/${fileId}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return res.json();
    } catch (e) {
      if (!/권한/.test(e.message)) throw e; // 권한 없으면 새 파일로
    }
  }
  const meta = { name: name.endsWith('.moatoon.json') ? name : `${name}.moatoon.json`, mimeType: 'application/json', ...(folderId ? { parents: [folderId] } : {}) };
  const boundary = `mt${Date.now()}`;
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,modifiedTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  return res.json();
}
