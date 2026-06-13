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
