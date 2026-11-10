import { initPage, esc, emptyState, pctBar, chart, tableHtml } from './ui.js';
import { api } from './api.js';

await initPage(['teacher']);
const $ = id => document.getElementById(id);
const [d, classes] = await Promise.all([api('/dashboard/teacher'), api('/classes')]);
const cn = id => classes.find(c => c.classId === id)?.className || '—';
const summaries = await Promise.all(d.subjects.map(s => api(`/attendance/subject/${s.subjectId}/summary`)));
const low = d.subjects.flatMap((s, i) => summaries[i].students.filter(st => st.low).map(st => ({ ...st, subject: s })));

$('st-subjects').textContent = d.totals.subjects; $('st-classes').textContent = d.totals.classes;
$('st-students').textContent = d.totals.students; $('st-low').textContent = low.length;

$('t-subjects').innerHTML = d.subjects.length ? tableHtml(['Subject', 'Class', 'Sessions', 'Average', ''], d.subjects.map(s => ({ cells: [
  `${esc(s.subjectCode)} · ${esc(s.subjectName)}`, esc(cn(s.classId)), s.sessionsConducted, pctBar(s.averagePercentage, s.sessionsConducted),
  `<div class="text-end text-nowrap"><a class="btn btn-sm btn-primary" href="mark-attendance.html?subjectId=${encodeURIComponent(s.subjectId)}">Mark</a> <a class="btn btn-sm btn-light" href="attendance-history.html?subjectId=${encodeURIComponent(s.subjectId)}">History</a></div>`] })))
  : emptyState('No subjects are assigned to you yet', 'book');

chart('chartTeacher', { type: 'bar', data: { labels: d.subjects.map(s => s.subjectCode), datasets: [{ label: 'Average %', data: d.subjects.map(s => s.averagePercentage), backgroundColor: d.subjects.map(s => s.averagePercentage < 75 ? '#dc2626' : '#2563eb') }] },
  options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });

$('low-list').innerHTML = low.length ? tableHtml(['Student', 'ID', 'Subject', 'Attended', 'Attendance'], low.map(s => ({ cells: [esc(s.fullName), esc(s.studentId), esc(s.subject.subjectCode), `${s.attended}/${s.conducted}`, pctBar(s.percentage, s.conducted)] })), () => 'row-low')
  : emptyState('Nobody is below 75% 🎉', 'emoji-smile');
