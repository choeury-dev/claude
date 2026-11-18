// Google 드라이브 연결 (Google Identity Services 토큰 + Drive REST API v3).
// 필요한 것: Google Cloud 콘솔에서 만든 "OAuth 클라이언트 ID(웹 애플리케이션)".
//   승인된 JavaScript 원본에 이 앱 주소(예: https://choeury-dev.github.io)를 넣어야 한다.
// 권한: drive.readonly(내 드라이브의 스크립트 읽기) + drive.file(이 앱이 만든 회차 파일 저장).
//
// - 권한 동의는 처음 한 번만 묻는다(prompt: ''). 이미 허락한 계정은 동의 화면 없이 바로 토큰을 받는다.
// - 받은 토큰(약 1시간)은 이 탭의 sessionStorage 에 두어, 새로고침해도 다시 로그인하지 않게 한다. 탭을 닫으면 사라진다.
// - 동의 화면에서 "드라이브 파일 보기"를 체크하지 않으면 목록이 비어 보이므로, 받은 권한을 확인해서 알려 준다.

const GSI = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPE = `${READ_SCOPE} ${FILE_SCOPE}`;
const SS_KEY = 'moatoon.gtoken';

export const MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc: 'application/vnd.google-apps.document',
};

let token = null;
let tokenExp = 0;
let granted = { read: false, file: false };
try {
  const s = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
  if (s && s.exp > Date.now()) { token = s.token; tokenExp = s.exp; granted = s.granted || granted; }
} catch { /* */ }

const fail = (code, message) => Object.assign(new Error(message), { code });

function loadGsi() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(fail('script', 'Google 로그인 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

export function isConnected() { return !!token && Date.now() < tokenExp; }
export function grantedScopes() { return { ...granted }; }
export function minutesLeft() { return isConnected() ? Math.max(0, Math.round((tokenExp - Date.now()) / 60000)) : 0; }

export async function connect(clientId, { forceConsent = false } = {}) {
  if (!clientId) throw fail('noclient', 'Google OAuth 클라이언트 ID를 먼저 입력해 주세요.');
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      include_granted_scopes: true,
      callback: (resp) => {
        if (resp.error) { reject(fail(resp.error === 'access_denied' ? 'denied' : 'login', `Google 로그인 실패: ${resp.error}`)); return; }
        const o = window.google.accounts.oauth2;
        granted = { read: o.hasGrantedAllScopes(resp, READ_SCOPE), file: o.hasGrantedAnyScope(resp, FILE_SCOPE, READ_SCOPE) };
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        try { sessionStorage.setItem(SS_KEY, JSON.stringify({ token, exp: tokenExp, granted })); } catch { /* */ }
        if (!granted.read) { reject(fail('scope', '드라이브 파일 보기 권한이 빠졌습니다.')); return; }
        resolve();
      },
      error_callback: (err) => reject(fail(err && err.type === 'popup_closed' ? 'closed' : 'popup', err && err.type === 'popup_closed' ? '로그인 창이 닫혔습니다.' : '로그인 창을 열지 못했습니다.')),
    });
    // 빈 prompt: 처음 한 번만 동의를 묻고, 이미 허락한 계정은 동의 화면 없이 바로 통과한다.
    // 권한 체크를 빠뜨렸을 때만 "권한 다시 받기"로 동의 화면을 다시 띄운다.
    client.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
  });
}

export function disconnect() {
  if (token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0; granted = { read: false, file: false };
  try { sessionStorage.removeItem(SS_KEY); } catch { /* */ }
}

// Google API 오류를 이유별로 나눈다
async function call(url, init = {}) {
  if (!isConnected()) throw fail('expired', 'Google 드라이브 연결이 끊겼습니다. 다시 연결해 주세요.');
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  let body = {};
  try { body = await res.json(); } catch { /* */ }
  const e = body.error || {};
  const reason = (e.errors && e.errors[0] && e.errors[0].reason) || (e.details && e.details[0] && e.details[0].reason) || e.status || '';
  const msg = e.message || '';
  if (res.status === 401) { disconnect(); throw fail('expired', 'Google 로그인이 만료되었습니다. 다시 연결해 주세요.'); }
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(`${reason} ${msg}`)) throw fail('api-disabled', msg);
  if (/insufficient|SCOPE/i.test(`${reason} ${msg}`)) throw fail('scope', msg);
  if (res.status === 404) throw fail('notfound', '폴더나 파일을 찾지 못했습니다. 폴더 주소와 그 폴더를 볼 수 있는 계정인지 확인해 주세요.');
  if (res.status === 403) throw fail('forbidden', msg || '이 파일에 접근할 권한이 없습니다.');
  throw fail('other', `Google 드라이브 오류 (${res.status}) ${msg}`);
}

// 폴더 주소(https://drive.google.com/drive/folders/XXXX)나 ID 에서 ID 만 꺼낸다
export function folderIdFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/folders\/([\w-]+)/) || t.match(/[?&]id=([\w-]+)/);
  return m ? m[1] : (/^[\w-]{10,}$/.test(t) ? t : '');
}

// 폴더 안이면 모든 파일(열 수 없는 형식도 보여 준다), 폴더가 없으면 내 드라이브 전체에서 열 수 있는 파일만
export async function list(folderId) {
  const kinds = `mimeType = '${MIME.folder}' or mimeType = '${MIME.doc}' or mimeType = 'text/plain' or mimeType = 'text/markdown' or name contains '.moatoon.json' or name contains '.txt' or name contains '.md'`;
  const q = folderId ? `trashed = false and '${folderId}' in parents` : `trashed = false and (${kinds})`;
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,modifiedTime,parents)', orderBy: 'folder,modifiedTime desc', pageSize: '300', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const res = await call(`${API}/files?${params}`);
  return (await res.json()).files || [];
}

export function kindOf(file) {
  if (file.mimeType === MIME.folder) return 'folder';
  if (/\.moatoon\.json$/i.test(file.name)) return 'episode';
  if (file.mimeType === MIME.doc || file.mimeType === 'text/plain' || file.mimeType === 'text/markdown' || /\.(txt|md)$/i.test(file.name)) return 'script';
  return 'unsupported';
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
      if (e.code !== 'forbidden' && e.code !== 'scope') throw e; // 이 앱이 만들지 않은 파일이면 새 파일로
    }
  }
  const meta = { name: name.endsWith('.moatoon.json') ? name : `${name}.moatoon.json`, mimeType: 'application/json', ...(folderId ? { parents: [folderId] } : {}) };
  const boundary = `mt${Date.now()}`;
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,modifiedTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  return res.json();
}
