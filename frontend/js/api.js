import { auth, logout } from './auth.js';
import { API_BASE } from './firebase-config.js';
import { spinner, toast } from './ui.js';

// api('/users', {query:{role:'student'}}) / api('/attendance', {method:'POST', body:{...}})
export async function api(path, { method = 'GET', body, query, quiet = false } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)) : '';
  const token = await auth.currentUser?.getIdToken();
  if (!token) return logout();
  spinner(true);
  try {
    const res = await fetch(API_BASE + path + qs, { method, headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return logout();
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  } catch (e) {
    if (!quiet) toast(e.message === 'Failed to fetch' ? 'Cannot reach the server' : e.message, 'error');
    throw e;
  } finally { spinner(false); }
}
