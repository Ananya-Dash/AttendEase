import { initPage, esc, toast, fillSelect, debounce, emptyState, pctBar, statusBadge, today, chart, tableHtml } from './ui.js';
import { api } from './api.js';

const user = await initPage(['teacher', 'admin']);
const $ = id => document.getElementById(id);
const route = location.pathname.split('/').pop() || 'index.html';
const page = route.endsWith('.html') ? route : route + '.html';
const params = new URLSearchParams(location.search);
const [classes, subjects] = await Promise.all([api('/classes'), api('/subjects')]);
const className = id => classes.find(c => c.classId === id)?.className || '—';
const subjectLabel = id => { const s = subjects.find(x => x.subjectId === id); return s ? `${s.subjectCode} · ${s.subjectName}` : id; };

const isHistory = page === 'attendance-history.html';
fillSelect($('f-class'), classes, c => c.classId, c => `${c.className} (Sem ${c.semester})`, isHistory ? 'All classes' : 'Select class');
function fillSubjects() {
  const cid = $('f-class').value, list = cid ? subjects.filter(s => s.classId === cid) : subjects;
  fillSelect($('f-subject'), list, s => s.subjectId, s => `${s.subjectCode} · ${s.subjectName}`, isHistory ? 'All subjects' : 'Select subject');
}
fillSubjects(); $('f-class').onchange = fillSubjects;
const preset = subjects.find(s => s.subjectId === params.get('subjectId'));
if (preset) { $('f-class').value = preset.classId; fillSubjects(); $('f-subject').value = preset.subjectId; }
$('f-date').value = params.get('date') || (isHistory ? '' : today());

if (isHistory) await historyPage(); else await markPage();

/* ---------------- Mark attendance ---------------- */
async function markPage() {
  let roster = [], marks = {}, existing = false, filter = '';
  const render = () => {
    const rows = roster.filter(s => !filter || (s.fullName + s.studentId).toLowerCase().includes(filter));
    $('roster').innerHTML = rows.length ? tableHtml(['#', 'Student', 'Student ID', 'Attendance'], rows.map((s, i) => ({ cells: [i + 1, esc(s.fullName), esc(s.studentId),
      `<div class="btn-group btn-group-sm att-toggle">${['present', 'absent'].map(v => `<button type="button" data-uid="${s.uid}" data-v="${v}" class="btn ${marks[s.uid] === v ? (v === 'present' ? 'btn-success' : 'btn-danger') : 'btn-outline-secondary'}">${v === 'present' ? 'Present' : 'Absent'}</button>`).join('')}</div>`] })))
      : emptyState(roster.length ? 'No students match your search' : 'No students are enrolled in this subject', 'people');
    const p = roster.filter(s => marks[s.uid] === 'present').length;
    $('mode-info').textContent = `${existing ? 'Editing saved attendance' : 'New session'} · ${p} present / ${roster.length - p} absent`;
    $('save-btn').disabled = !roster.length;
  };
  const hideRoster = () => { $('roster-card').hidden = true; };
  ['f-class', 'f-subject', 'f-date'].forEach(id => $(id).addEventListener('change', hideRoster));

  $('load-btn').onclick = async () => {
    const subjectId = $('f-subject').value, date = $('f-date').value;
    if (!subjectId || !date) return toast('Select a class, subject and date', 'warning');
    roster = await api(`/subjects/${subjectId}/students`);
    const sessions = await api('/attendance/sessions', { query: { subjectId, date } });
    existing = sessions.length > 0; marks = {}; $('cancelled').checked = false;
    if (existing) {
      const d = await api(`/attendance/sessions/${sessions[0].sessionId}`);
      d.records.forEach(r => { marks[r.uid] = r.status || 'present'; });
      $('cancelled').checked = d.session.status === 'cancelled';
    } else roster.forEach(s => { marks[s.uid] = 'present'; }); // default present; flip the absentees
    $('q').value = ''; filter = ''; $('roster-card').hidden = false; render();
  };
  $('roster').addEventListener('click', e => { const b = e.target.closest('[data-uid]'); if (!b) return; marks[b.dataset.uid] = b.dataset.v; render(); });
  $('all-present').onclick = () => { roster.forEach(s => { marks[s.uid] = 'present'; }); render(); };
  $('all-absent').onclick = () => { roster.forEach(s => { marks[s.uid] = 'absent'; }); render(); };
  $('q').addEventListener('input', debounce(e => { filter = e.target.value.trim().toLowerCase(); render(); }, 150));

  $('save-btn').onclick = async () => {
    const body = { subjectId: $('f-subject').value, date: $('f-date').value, status: $('cancelled').checked ? 'cancelled' : 'completed',
      records: roster.map(s => ({ studentUid: s.uid, status: marks[s.uid] })) };
    try {
      await api('/attendance', { method: existing ? 'PUT' : 'POST', body });
      toast(existing ? 'Attendance updated' : 'Attendance saved'); existing = true; render();
    } catch (e) {
      if (e.status === 409) { existing = true; render(); toast('A session already exists for this date; saving will now update it.', 'warning'); }
    }
  };
  if (preset && $('f-date').value) $('load-btn').click();
}

/* ---------------- History ---------------- */
async function historyPage() {
  let summaryRows = [];
  async function loadSessions() {
    const query = { classId: $('f-class').value, subjectId: $('f-subject').value, date: $('f-date').value };
    const list = await api('/attendance/sessions', { query });
    $('sessions').innerHTML = list.length ? tableHtml(['Date', 'Class', 'Subject', 'Status', ''], list.map(s => ({ cells: [esc(s.date), esc(className(s.classId)), esc(subjectLabel(s.subjectId)), statusBadge(s.status),
      `<div class="text-end text-nowrap"><button class="btn btn-sm btn-light" data-view="${esc(s.sessionId)}"><i class="bi bi-eye"></i> View</button> <a class="btn btn-sm btn-light" href="mark-attendance.html?subjectId=${encodeURIComponent(s.subjectId)}&date=${s.date}"><i class="bi bi-pencil"></i> Edit</a></div>`] })))
      : emptyState('No attendance sessions match these filters', 'clipboard-x');
    if (query.subjectId) await loadSummary(query.subjectId); else $('summary-card').hidden = true;
  }
  async function loadSummary(subjectId) {
    const s = await api(`/attendance/subject/${subjectId}/summary`);
    summaryRows = s.students; $('summary-card').hidden = false;
    $('summary-title').textContent = `${subjectLabel(subjectId)} — ${s.sessionsConducted} classes conducted, ${s.belowThreshold} below 75%`;
    chart('chartSummary', { type: 'bar', data: { labels: s.students.map(x => x.fullName), datasets: [{ label: 'Attendance %', data: s.students.map(x => x.percentage), backgroundColor: s.students.map(x => x.low ? '#dc2626' : '#16a34a') }] },
      options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
    renderSummary();
  }
  function renderSummary() {
    const q = $('q').value.trim().toLowerCase(), rows = summaryRows.filter(s => !q || (s.fullName + s.studentId).toLowerCase().includes(q));
    $('summary').innerHTML = rows.length ? tableHtml(['Student', 'ID', 'Attended', 'Attendance'], rows.map(s => ({ cells: [esc(s.fullName), esc(s.studentId), `${s.attended}/${s.conducted}`, pctBar(s.percentage, s.conducted)], low: s.low })), r => r.low ? 'row-low' : '') : emptyState('No students found', 'people');
  }
  $('q').addEventListener('input', debounce(renderSummary, 150));
  $('apply-btn').onclick = loadSessions;
  $('clear-btn').onclick = () => { $('f-class').value = ''; fillSubjects(); $('f-date').value = ''; loadSessions(); };
  $('sessions').addEventListener('click', async e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const d = await api(`/attendance/sessions/${b.dataset.view}`);
    $('sessionTitle').textContent = `${subjectLabel(d.session.subjectId)} · ${d.session.date}${d.session.status === 'cancelled' ? ' (cancelled)' : ''}`;
    $('sessionBody').innerHTML = tableHtml(['Student', 'ID', 'Status'], d.records.map(r => ({ cells: [esc(r.fullName), esc(r.studentId), statusBadge(r.status)] })));
    bootstrap.Modal.getOrCreateInstance($('sessionModal')).show();
  });
  await loadSessions();
}


