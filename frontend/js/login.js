import { login, redirectIfSignedIn, HOME } from './auth.js';

const form = document.getElementById('login-form'), alertBox = document.getElementById('login-alert'), btn = document.getElementById('login-btn');
const showError = m => { alertBox.innerHTML = `<div class="alert alert-danger py-2"><i class="bi bi-exclamation-circle"></i> ${m}</div>`; };
if (new URLSearchParams(location.search).get('reason') === 'profile') showError('Your account has no active profile. Contact your administrator.');
redirectIfSignedIn();

form.addEventListener('submit', async e => {
  e.preventDefault(); alertBox.innerHTML = '';
  const email = form.email.value.trim(), password = form.password.value;
  if (!email || !password) return showError('Enter your email and password.');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Signing in…';
  try { const p = await login(email, password); location.replace(HOME[p.role]); }
  catch (err) {
    const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code);
    showError(bad ? 'Incorrect email or password.' : err.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.' : err.code === 'auth/user-disabled' ? 'This account has been deactivated.' : (err.message || 'Sign-in failed.'));
    btn.disabled = false; btn.textContent = 'Sign in';
  }
});
