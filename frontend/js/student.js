import { initPage, esc, emptyState, pctBar, pctClass, statusBadge, fillSelect, chart, tableHtml } from './ui.js';
import { api } from './api.js';

const user = await initPage(['student']);
const $ = id => document.getElementById(id);
const route = location.pathname.split('/').pop() || 'index.html';
const page = route.endsWith('.html') ? route : route + '.html';
if (page === 'student.html') await dashboard(); else await detail();

async function dashboard() {
  const d = await api('/dashboard/student');
  const initials = d.profile.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('p-avatar').textContent = initials; $('p-name').textContent = d.profile.fullName; $('p-meta').textContent = `${d.profile.studentId} · ${d.profile.email}`;
  if (d.warning) $('warning').innerHTML = `<div class="alert alert-danger d-flex align-items-center gap-2"><i class="bi bi-exclamation-triangle-fill"></i><div><strong>Low attendance.</strong> ${esc(d.warning)} Attend regularly to reach the 75% requirement.</div></div>`;
  const pct = $('st-pct'); pct.textContent = d.conducted ? d.percentage.toFixed(2) + '%' : 'No classes yet'; if (d.conducted) pct.className += ' ' + pctClass(d.percentage);
  $('st-conducted').textContent = d.conducted; $('st-attended').textContent = d.attended;
  const rows = d.enrolledSubjects.map(s => ({ s, a: d.bySubject[s.subjectId] || { conducted: 0, attended: 0, percentage: 0 } }));
  $('subjects').innerHTML = rows.length ? tableHtml(['Subject', 'Attended', 'Attendance'], rows.map(({ s, a }) => ({ cells: [`${esc(s.subjectCode)} · ${esc(s.subjectName)}`, `${a.attended}/${a.conducted}`, pctBar(a.percentage, a.conducted)], low: a.conducted > 0 && a.percentage < 75 })), r => r.low ? 'row-low' : '')
    : emptyState('You are not enrolled in any subjects yet', 'journal');
  chart('chartSubjects', { type: 'bar', data: { labels: rows.map(r => r.s.subjectCode), datasets: [{ label: 'Attendance %', data: rows.map(r => r.a.percentage), backgroundColor: rows.map(r => r.a.percentage < 75 && r.a.conducted ? '#dc2626' : '#16a34a') }] },
    options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
}

async function detail() {
  fillSelect($('f-subject'), await api('/subjects'), s => s.subjectId, s => `${s.subjectCode} · ${s.subjectName}`, 'All subjects');
  async function load() {
    const { summary, history } = await api(`/attendance/student/${user.uid}`, { query: { subjectId: $('f-subject').value } });
    const present = history.filter(h => h.status === 'present').length, absent = history.length - present;
    $('summary-line').innerHTML = summary.conducted ? `<div class="small text-muted">Attended ${summary.attended} of ${summary.conducted} classes</div><div class="fs-4 ${pctClass(summary.percentage)}">${summary.percentage.toFixed(2)}%</div>${summary.low ? '<div class="text-danger small"><i class="bi bi-exclamation-triangle"></i> Below the 75% requirement</div>' : ''}` : '<span class="text-muted">No classes conducted yet</span>';
    chart('chartStatus', { type: 'doughnut', data: { labels: ['Present', 'Absent'], datasets: [{ data: [present, absent], backgroundColor: ['#16a34a', '#dc2626'] }] } });
    $('history').innerHTML = history.length ? tableHtml(['Date', 'Subject', 'Status'], history.map(h => ({ cells: [esc(h.date), esc(h.subjectName), statusBadge(h.status)] }))) : emptyState('No attendance records yet', 'calendar-x');
  }
  $('f-subject').onchange = load; await load();
}


