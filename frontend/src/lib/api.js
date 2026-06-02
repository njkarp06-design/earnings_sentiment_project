import { getToken, clearToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (res.status === 401) {
    clearToken(); // Expired / invalid JWT — clear it so the UI snaps back to logged-out state.
    throw new Error('Session expired — please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Public endpoints ─────────────────────────────────────────────────────────

export const getFeed = () => apiFetch('/feed');
export const getFeedSince = (since) => apiFetch(`/feed?since=${encodeURIComponent(since)}`);
export const getLeaderboard = () => apiFetch('/leaderboard');
export const getCompanyHistory = (ticker) => apiFetch(`/companies/${ticker}/history`);
export const getPrices = (ticker, days = 90) => apiFetch(`/prices/${ticker}?days=${days}`);
export const getAccuracy = (ticker) => apiFetch(`/companies/${ticker}/accuracy`);
export const getCalendar = (from, to) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  return apiFetch(`/calendar${params.toString() ? '?' + params : ''}`, { headers: authHeaders() });
};
export const searchCompanies = (q) => apiFetch(`/search?q=${encodeURIComponent(q)}`);

// ── Auth endpoints ────────────────────────────────────────────────────────────

export const getMe = () =>
  apiFetch('/auth/me', { headers: authHeaders() });

export const updatePreferences = (prefs) =>
  apiFetch('/auth/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(prefs),
  });

export const login = (email, password) =>
  apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

export const register = (email, password) =>
  apiFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

// ── Portfolio endpoints (require JWT) ─────────────────────────────────────────

export const getPortfolioItems = () =>
  apiFetch('/portfolio', { headers: authHeaders() });

export const addToPortfolio = (ticker) =>
  apiFetch(`/portfolio/${ticker}`, {
    method: 'POST',
    headers: authHeaders(),
  });

export const removeFromPortfolio = (ticker) =>
  apiFetch(`/portfolio/${ticker}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

export const getSuggestions = () =>
  apiFetch('/suggestions', { headers: authHeaders() });

export const getPulse = () => apiFetch('/pulse');

// ── Inspect — SSE streaming (require JWT) ─────────────────────────────────────
// Calls onText(chunk) progressively, then onDone() when the stream ends.
export async function inspectCall(data, onText, onDone, onError) {
  let response;
  try {
    response = await fetch(`${BASE}/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
  } catch (err) {
    onError?.(err.message);
    return;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    onError?.(err.error || response.statusText);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // Buffer incomplete lines across chunk boundaries so partial JSON is never dropped.
  let buffer = '';

  const processLine = (line) => {
    if (!line.startsWith('data: ')) return false;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') { onDone?.(); return true; }
    try {
      const { text, error } = JSON.parse(payload);
      if (error) { onError?.(error); return true; }
      if (text) onText(text);
    } catch { /* skip genuinely malformed lines */ }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the last (possibly incomplete) line

      for (const line of lines) {
        if (processLine(line)) return;
      }
    }

    // Flush any data remaining in the buffer after the stream closes
    if (buffer && processLine(buffer)) return;
  } finally {
    reader.cancel().catch(() => {});
  }

  onDone?.();
}
