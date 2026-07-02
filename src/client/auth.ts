import axios from 'axios';

const TOKEN_KEY = 'ehr_jwt';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token?: string | null): void {
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage errors (e.g. Safari private mode) */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// 記住 lineUserId，讓 PWA/standalone 開啟時不必每次重做 LINE 登入。
// （LIFF 的 access token 在 app 關閉後即失效，會逼每次重登；改用本機快取的
//  lineUserId + 公開的 check-binding 端點重新取得 7 天 token，繞過 LINE 重登。）
const LINE_UID_KEY = 'ehr_line_uid';

export function getLineUid(): string | null {
  try {
    return localStorage.getItem(LINE_UID_KEY);
  } catch {
    return null;
  }
}

export function setLineUid(uid?: string | null): void {
  if (!uid) return;
  try {
    localStorage.setItem(LINE_UID_KEY, uid);
  } catch {
    /* ignore */
  }
}

export function clearLineUid(): void {
  try {
    localStorage.removeItem(LINE_UID_KEY);
  } catch {
    /* ignore */
  }
}

// Header object for manual fetch() calls (axios calls are covered by the
// interceptor; fetch is not, so streaming endpoints must spread this in).
export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let installed = false;

// Install a single axios request interceptor that injects the JWT as a
// Bearer token on every request. It reads from storage on each request, so a
// freshly stored token (after bind / re-bind) is picked up without re-install.
export function installAuthInterceptor(): void {
  if (installed) return;
  installed = true;
  axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
    return config;
  });
}
