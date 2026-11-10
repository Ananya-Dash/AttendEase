import { initPage, esc, toast, confirmDialog, fillSelect, debounce, emptyState, pctBar, chart, formModal, tableHtml } from './ui.js';
import { api } from './api.js';

const route = location.pathname.split('/').pop() || 'index.html';
const page = route.endsWith('.html') ? route : route + '.html';
await initPage(['admin']);
const $ = id => document.getElementById(id);
const statusPill = s => `<span class="badge ${s === 'active' ? 'text-bg-success' : 'text-bg-secondary'}">${s}</span>`;

if (page === 'admin.html') await dashboard();
else if (page === 'students.html') await userPage('student');
else if (page === 'teachers.html') await userPage('teacher');
else if (page === 'classes.html') await classesPage();

async function dashboard() {
  const d = await api('/dashboard/admin');
  $('st-students').textContent = d.totals.students; $('st-teachers').textContent = d.totals.teachers;
  $('st-classes').textContent = d.totals.classes; $('st-subjects').textContent = d.totals.subjects;
  chart('chartOverall', { type: 'doughnut', data: { labels: ['Present', 'Absent'], datasets: [{ data: [d.overall.present, d.overall.absent], backgroundColor: ['#16a34a', '#dc2626'] }] } });
  chart('chartSubjects', { type: 'bar', data: { labels: d.bySubject.map(s => s.subjectName), datasets: [{ label: 'Attendance %', data: d.bySubject.map(s => s.percentage), backgroundColor: d.bySubject.map(s => s.percentage < 75 ? '#dc2626' : '#2563eb') }] },
    options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
  $('subj-table').innerHTML = d.bySubject.length ? tableHtml(['Subject', 'Present', 'Absent', 'Attendance'],
    d.bySubject.map(s => ({ cells: [esc(s.subjectName), s.present, s.absent, pctBar(s.percentage, s.present + s.absent)] }))) : emptyState('No subjects yet', 'journal');
}

async function userPage(role) {
  const idField = role === 'student' ? 'studentId' : 'teacherId';
  const modal = formModal('userModal'); let editing = null, users = [];
  const pw = modal.form.elements.password.closest('.mb-3');

  async function load() {
    users = await api('/users', { query: { role, q: $('q').value.trim(), status: $('status').value } });
    $('list').innerHTML = users.length ? tableHtml(['Name', role === 'student' ? 'Student ID' : 'Teacher ID', 'Email', 'Status', ''],
      users.map(u => ({ cells: [esc(u.fullName), esc(u[idField]), esc(u.email), statusPill(u.status),
        `<div class="text-end text-nowrap"><button class="btn btn-sm btn-light" data-act="edit" data-uid="${u.uid}" title="Edit"><i class="bi bi-pencil"></i></button> ` +
        (role === 'student' ? `<button class="btn btn-sm btn-light" data-act="enroll" data-uid="${u.uid}" title="Enroll"><i class="bi bi-journal-plus"></i></button> ` : '') +
        `<button class="btn btn-sm btn-light" data-act="status" data-uid="${u.uid}" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}"><i class="bi bi-${u.status === 'active' ? 'person-slash' : 'person-check'}"></i></button></div>`] })))
      : emptyState(`No ${role}s found`, 'people');
  }
  $('q').addEventListener('input', debounce(load)); $('status').addEventListener('change', load);

  $('add-btn').onclick = () => {
    editing = null; pw.hidden = false; modal.form.elements.password.required = true; modal.form.elements.email.disabled = false;
    modal.open({}, `Add ${role}`, async d => { await api('/users', { method: 'POST', body: { role, ...d } }); toast(`${role} created`); load(); });
  };
  $('list').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const u = users.find(x => x.uid === b.dataset.uid);
    if (b.dataset.act === 'edit') {
      pw.hidden = true; modal.form.elements.password.required = false; modal.form.elements.email.disabled = true;
      modal.open({ fullName: u.fullName, email: u.email, [idField]: u[idField] }, `Edit ${role}`, async d => {
        await api(`/users/${u.uid}`, { method: 'PATCH', body: { fullName: d.fullName, [idField]: d[idField] } }); toast('Saved'); load(); });
    } else if (b.dataset.act === 'status') {
      const next = u.status === 'active' ? 'inactive' : 'active';
      if (await confirmDialog(`${next === 'inactive' ? 'Deactivate' : 'Reactivate'} ${u.fullName}?`, next === 'inactive' ? 'Deactivate' : 'Reactivate')) {
        await api(`/users/${u.uid}/status`, { method: 'PATCH', body: { status: next } }); toast(`Account ${next}`); load(); }
    } else if (b.dataset.act === 'enroll') enrollDialog(u);
  });
  await load();
}

async function enrollDialog(student) {
  const el = $('enrollModal'), m = bootstrap.Modal.getOrCreateInstance(el), form = el.querySelector('form');
  const classes = await api('/classes'); let subjects = [], enrolled = new Set();
  el.querySelector('.modal-title').textContent = `Enroll ${student.fullName}`;
  fillSelect($('enroll-class'), classes, c => c.classId, c => `${c.className} (Sem ${c.semester}, ${c.academicYear})`, 'Select class');
  enrolled = new Set((await api('/enrollments', { query: { studentUid: student.uid } })).map(e => e.subjectId));
  async function showSubjects() {
    const classId = $('enroll-class').value; if (!classId) { $('enroll-subjects').innerHTML = emptyState('Choose a class', 'journal'); return; }
    subjects = await api('/subjects', { query: { classId } });
    $('enroll-subjects').innerHTML = subjects.length ? subjects.map(s => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${esc(s.subjectId)}" id="en-${esc(s.subjectId)}" ${enrolled.has(s.subjectId) ? 'checked' : ''}><label class="form-check-label" for="en-${esc(s.subjectId)}">${esc(s.subjectCode)} · ${esc(s.subjectName)}</label></div>`).join('') : emptyState('No subjects in this class', 'book');
  }
  $('enroll-class').onchange = showSubjects; await showSubjects();
  form.onsubmit = async e => {
    e.preventDefault(); const classId = $('enroll-class').value; if (!classId) return toast('Select a class', 'warning');
    const checked = new Set([...$('enroll-subjects').querySelectorAll('input:checked')].map(i => i.value));
    const add = [...checked].filter(id => !enrolled.has(id)), remove = subjects.map(s => s.subjectId).filter(id => enrolled.has(id) && !checked.has(id));
    try {
      if (add.length) await api('/enrollments', { method: 'POST', body: { studentUid: student.uid, classId, subjectIds: add } });
      for (const id of remove) await api(`/enrollments/${student.uid}_${id}`, { method: 'DELETE' });
      toast('Enrollment updated'); m.hide();
    } catch { /* toasted */ }
  };
  m.show();
}

async function classesPage() {
  const cm = formModal('classModal'), sm = formModal('subjectModal'); let classes = [], subjects = [], teachers = [];
  async function load() {
    [classes, subjects, teachers] = await Promise.all([api('/classes'), api('/subjects'), api('/users', { query: { role: 'teacher', status: 'active' } })]);
    const cn = id => classes.find(c => c.classId === id)?.className, tn = uid => teachers.find(t => t.uid === uid)?.fullName;
    $('classes-list').innerHTML = classes.length ? tableHtml(['Class', 'Semester', 'Academic year', ''], classes.map(c => ({ cells: [esc(c.className), esc(c.semester), esc(c.academicYear),
      `<div class="text-end"><button class="btn btn-sm btn-light" data-class="${c.classId}"><i class="bi bi-pencil"></i></button></div>`] }))) : emptyState('No classes yet', 'journal');
    $('subjects-list').innerHTML = subjects.length ? tableHtml(['Code', 'Subject', 'Class', 'Teacher', ''], subjects.map(s => ({ cells: [esc(s.subjectCode), esc(s.subjectName),
      esc(cn(s.classId) || '—') + ` <span class="text-muted small">Sem ${esc(classes.find(c => c.classId === s.classId)?.semester || '')}</span>`,
      s.teacherUid ? esc(tn(s.teacherUid) || 'Unknown') : '<span class="badge text-bg-warning">Unassigned</span>',
      `<div class="text-end"><button class="btn btn-sm btn-light" data-subject="${s.subjectId}"><i class="bi bi-pencil"></i></button></div>`] }))) : emptyState('No subjects yet', 'book');
  }
  $('add-class').onclick = () => cm.open({}, 'Add class', async d => { await api('/classes', { method: 'POST', body: d }); toast('Class created'); load(); });
  $('classes-list').addEventListener('click', e => {
    const b = e.target.closest('[data-class]'); if (!b) return; const c = classes.find(x => x.classId === b.dataset.class);
    cm.open(c, 'Edit class', async d => { await api(`/classes/${c.classId}`, { method: 'PATCH', body: d }); toast('Saved'); load(); });
  });
  const prepSubjectForm = () => { fillSelect($('sub-class'), classes, c => c.classId, c => `${c.className} (Sem ${c.semester})`, 'Select class');
    fillSelect($('sub-teacher'), teachers, t => t.uid, t => `${t.fullName} (${t.teacherId})`, 'Unassigned'); };
  $('add-subject').onclick = () => { prepSubjectForm(); sm.form.elements.classId.disabled = false;
    sm.open({}, 'Add subject', async d => { await api('/subjects', { method: 'POST', body: d }); toast('Subject created'); load(); }); };
  $('subjects-list').addEventListener('click', e => {
    const b = e.target.closest('[data-subject]'); if (!b) return; const s = subjects.find(x => x.subjectId === b.dataset.subject);
    prepSubjectForm(); sm.open({ subjectName: s.subjectName, subjectCode: s.subjectCode, classId: s.classId, teacherUid: s.teacherUid || '' }, 'Edit subject / assign teacher', async d => {
      await api(`/subjects/${s.subjectId}`, { method: 'PATCH', body: { subjectName: d.subjectName, subjectCode: d.subjectCode, teacherUid: d.teacherUid || null } }); toast('Saved'); load(); });
    sm.form.elements.classId.disabled = true;
  });
  await load();
}

