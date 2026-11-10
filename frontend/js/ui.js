import { requireAuth, logout } from './auth.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const pctClass = p => (p < 75 ? 'pct-low' : 'pct-ok');
export const pctBar = (p, conducted = 1) => conducted === 0 ? '<span class="text-muted small">No classes yet</span>' :
  `<div class="d-flex align-items-center gap-2"><div class="progress flex-grow-1"><div class="progress-bar ${p < 75 ? 'bg-danger' : 'bg-success'}" style="width:${Math.min(p, 100)}%"></div></div><span class="${pctClass(p)}">${p.toFixed(2)}%</span></div>`;
export const statusBadge = s => `<span class="badge ${s === 'present' ? 'text-bg-success' : s === 'absent' ? 'text-bg-danger' : s === 'cancelled' ? 'text-bg-secondary' : 'text-bg-light'}">${esc(s || 'not marked')}</span>`;
export const emptyState = (msg, icon = 'inbox') => `<div class="empty-state"><i class="bi bi-${icon}"></i>${esc(msg)}</div>`;
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

let spin = 0;
export function spinner(on) {
  let el = document.getElementById('global-spinner');
  if (!el) { el = document.createElement('div'); el.id = 'global-spinner'; el.innerHTML = '<div class="spinner-border text-primary" role="status"></div>'; document.body.append(el); }
  spin = Math.max(0, spin + (on ? 1 : -1)); el.classList.toggle('show', spin > 0);
}
export function toast(msg, type = 'success') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.append(wrap); }
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : type} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  wrap.append(el);
  const t = new bootstrap.Toast(el, { delay: 4000 }); t.show(); el.addEventListener('hidden.bs.toast', () => el.remove());
}
export function confirmDialog(message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const el = document.createElement('div'); el.className = 'modal fade';
    el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-body p-4"><h5 class="mb-2">Are you sure?</h5><p class="text-muted mb-4">${esc(message)}</p><div class="text-end"><button class="btn btn-light" data-no>Cancel</button> <button class="btn btn-primary" data-yes>${esc(okLabel)}</button></div></div></div></div>`;
    document.body.append(el); const m = new bootstrap.Modal(el); let result = false;
    el.querySelector('[data-yes]').onclick = () => { result = true; m.hide(); };
    el.querySelector('[data-no]').onclick = () => m.hide();
    el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(result); });
    m.show();
  });
}
export function fillSelect(sel, items, valueFn, labelFn, placeholder) {
  sel.innerHTML = (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') + items.map(i => `<option value="${esc(valueFn(i))}">${esc(labelFn(i))}</option>`).join('');
}
const charts = {};
export function chart(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), { ...config, options: { responsive: true, maintainAspectRatio: false, ...config.options } });
}

const NAV = {
  admin: [['admin.html', 'speedometer2', 'Dashboard'], ['students.html', 'mortarboard', 'Students'], ['teachers.html', 'person-workspace', 'Teachers'],
    ['classes.html', 'journal-bookmark', 'Classes & Subjects'], ['attendance-history.html', 'clipboard-data', 'Attendance Records']],
  teacher: [['teacher.html', 'speedometer2', 'Dashboard'], ['mark-attendance.html', 'check2-square', 'Mark Attendance'], ['attendance-history.html', 'clock-history', 'Attendance History']],
  student: [['student.html', 'speedometer2', 'Dashboard'], ['student-attendance.html', 'calendar-check', 'My Attendance']]
};

// Guards the page, injects sidebar + top bar, moves #page into the layout.
export async function initPage(roles) {
  const user = await requireAuth(roles);
  const route = location.pathname.split('/').pop() || 'index.html';
  const page = route.endsWith('.html') ? route : route + '.html';
  const links = NAV[user.role].map(([href, icon, label]) => `<a class="nav-link ${href === page ? 'active' : ''}" href="${href}"><i class="bi bi-${icon}"></i>${label}</a>`).join('');
  const initials = user.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const content = document.getElementById('page');
  document.getElementById('shell').innerHTML = `
    <aside class="sidebar offcanvas-lg offcanvas-start" id="sidebar"><div class="brand"><i class="bi bi-mortarboard-fill"></i>AttendEase</div>
      <nav class="nav flex-column py-3">${links}</nav></aside>
    <div class="app-main"><header class="topbar d-flex align-items-center justify-content-between">
      <button class="btn btn-light d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#sidebar"><i class="bi bi-list"></i></button>
      <span class="d-none d-lg-block text-muted text-capitalize">${esc(user.role)} portal</span>
      <div class="d-flex align-items-center gap-3"><div class="text-end d-none d-sm-block"><div class="fw-semibold small">${esc(user.fullName)}</div><div class="text-muted small">${esc(user.email)}</div></div>
        <span class="avatar">${esc(initials)}</span><button class="btn btn-outline-secondary btn-sm" id="logout-btn"><i class="bi bi-box-arrow-right"></i> Log out</button></div></header>
      <main class="p-3 p-lg-4" id="main"></main></div>`;
  document.getElementById('main').append(content); content.hidden = false;
  document.getElementById('logout-btn').onclick = logout;
  return user;
}

// Wraps a Bootstrap modal containing a <form>: open(values, title, async handler(data)).
export function formModal(id) {
  const el = document.getElementById(id), modal = new bootstrap.Modal(el), form = el.querySelector('form');
  let handler;
  form.addEventListener('submit', async e => {
    e.preventDefault(); form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    try { await handler(Object.fromEntries(new FormData(form))); modal.hide(); } catch { /* api() already toasted */ }
  });
  return { form, modal, open(values = {}, title, h) {
    form.reset(); form.classList.remove('was-validated');
    for (const [k, v] of Object.entries(values)) if (form.elements[k]) form.elements[k].value = v ?? '';
    if (title) el.querySelector('.modal-title').textContent = title;
    handler = h; modal.show();
  } };
}
export const tableHtml = (heads, rows, rowClass = () => '') =>
  `<table class="table table-hover mb-0"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${rowClass(r)}">${r.cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

