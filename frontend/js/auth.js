import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig, USE_AUTH_EMULATOR } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (USE_AUTH_EMULATOR) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
export const HOME = { admin: 'admin.html', teacher: 'teacher.html', student: 'student.html' };

export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const response = await fetch((location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8080' : '') + '/api/me', {
    headers: { Authorization: `Bearer ${await credential.user.getIdToken()}` }
  });
  if (!response.ok) { await signOut(auth); const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Your account has no active profile.'); }
  const profile = await response.json();
  if (!HOME[profile.role]) { await signOut(auth); throw new Error('Your account role is not supported.'); }
  return profile;
}

export async function logout() {
  await signOut(auth);
  location.replace('index.html');
}

export async function requireAuth(roles = []) {
  const user = await new Promise(resolve => {
    const stop = onAuthStateChanged(auth, current => { stop(); resolve(current); });
  });
  if (!user) { location.replace('index.html'); return null; }
  try {
    const res = await fetch((location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8080' : '') + '/api/me', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) throw new Error('inactive');
    const profile = await res.json();
    if (roles.length && !roles.includes(profile.role)) { location.replace('unauthorized.html'); return null; }
    return profile;
  } catch { await signOut(auth); location.replace('index.html?reason=profile'); return null; }
}

export function redirectIfSignedIn() {
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
      const res = await fetch((location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8080' : '') + '/api/me', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (res.ok) { const p = await res.json(); if (HOME[p.role]) location.replace(HOME[p.role]); }
    } catch { /* Login form remains available when the API is offline. */ }
  });
}

