const { db } = require('../config/firebaseAdmin');
const HttpError = require('../utils/httpError');
const V = require('../utils/validate');
const { summarize, percentage } = require('../utils/attendanceCalc');
const academic = require('./academicService');

const sessionsCol = db.collection('attendanceSessions');
const recordsCol = db.collection('attendanceRecords');
const data = s => s.docs.map(d => d.data());

async function authorizeSubject(user, subjectId) {
  const subject = await academic.getSubject(subjectId);
  if (user.role === 'teacher' && subject.teacherUid !== user.uid) throw new HttpError(403, 'You are not assigned to this subject');
  if (user.role === 'student') throw new HttpError(403, 'Forbidden');
  return subject;
}

// One session per subject+date: deterministic id makes duplicates impossible (checked inside a transaction).
// mode 'create' -> 409 if it exists; mode 'update' -> 404 if it does not.
async function saveAttendance(user, body, mode) {
  const subjectId = V.str(body.subjectId, 'subjectId');
  const date = V.date(body.date);
  const sessionStatus = body.status === undefined ? 'completed' : V.oneOf(body.status, 'status', ['completed', 'cancelled']);
  if (!Array.isArray(body.records)) throw new HttpError(400, 'records must be an array');
  const subject = await authorizeSubject(user, subjectId);
  const roster = new Set((await academic.studentsOfSubject(subjectId)).map(s => s.uid));

  const marks = new Map();
  for (const r of body.records) {
    if (!roster.has(r.studentUid)) throw new HttpError(400, `Student ${r.studentUid} is not enrolled in this subject`);
    marks.set(r.studentUid, V.oneOf(r.status, 'record status', ['present', 'absent']));
  }
  if (sessionStatus === 'completed' && marks.size !== roster.size) throw new HttpError(400, 'Mark every enrolled student as present or absent');

  const sessionId = `${subjectId}_${date}`;
  const ref = sessionsCol.doc(sessionId);
  const now = new Date().toISOString();

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (mode === 'create' && snap.exists) throw new HttpError(409, 'Attendance already exists for this subject and date; use update');
    if (mode === 'update' && !snap.exists) throw new HttpError(404, 'No attendance session for this subject and date');
    tx.set(ref, { sessionId, classId: subject.classId, subjectId, teacherUid: subject.teacherUid || user.uid, date,
      status: sessionStatus, createdAt: snap.exists ? snap.data().createdAt : now, updatedAt: now });
    // Rosters up to ~480 students fit in one transaction (500 write limit).
    for (const uid of roster) {
      const status = marks.get(uid) || 'absent';
      const id = `${sessionId}_${uid}`;
      tx.set(recordsCol.doc(id), { recordId: id, sessionId, subjectId, classId: subject.classId, date, studentUid: uid, status,
        sessionStatus, createdAt: now, updatedAt: now }, { merge: true });
    }
  });
  return { sessionId, status: sessionStatus, recorded: roster.size };
}

async function listSessions(user, { subjectId, classId, date }) {
  let subjectIds = null;
  if (user.role === 'teacher') subjectIds = (await academic.listSubjects(user)).map(s => s.subjectId);
  if (subjectId) {
    if (subjectIds && !subjectIds.includes(subjectId)) throw new HttpError(403, 'You are not assigned to this subject');
    subjectIds = [subjectId];
  }
  let list;
  if (subjectIds) {
    if (!subjectIds.length) return [];
    const chunks = []; for (let i = 0; i < subjectIds.length; i += 30) chunks.push(subjectIds.slice(i, i + 30));
    list = (await Promise.all(chunks.map(c => sessionsCol.where('subjectId', 'in', c).get()))).flatMap(data);
  } else list = data(await sessionsCol.get());
  if (classId) list = list.filter(s => s.classId === classId);
  if (date) list = list.filter(s => s.date === V.date(date));
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

async function getSession(user, sessionId) {
  const s = await sessionsCol.doc(sessionId).get();
  if (!s.exists) throw new HttpError(404, 'Session not found');
  const session = s.data();
  await authorizeSubject(user, session.subjectId);
  const [records, roster] = await Promise.all([
    recordsCol.where('sessionId', '==', sessionId).get().then(data), academic.studentsOfSubject(session.subjectId)]);
  const byUid = new Map(records.map(r => [r.studentUid, r.status]));
  return { session, records: roster.map(st => ({ ...st, status: byUid.get(st.uid) || null })) };
}

async function studentAttendance(user, studentUid, { subjectId } = {}) {
  if (user.role === 'student' && user.uid !== studentUid) throw new HttpError(403, 'You can only view your own attendance');
  let q = recordsCol.where('studentUid', '==', studentUid);
  if (subjectId) q = q.where('subjectId', '==', subjectId);
  let records = data(await q.get());
  if (user.role === 'teacher') { // teachers see only their subjects
    const mine = new Set((await academic.listSubjects(user)).map(s => s.subjectId));
    records = records.filter(r => mine.has(r.subjectId));
  }
  const pseudo = records.map(r => ({ sessionId: r.sessionId, subjectId: r.subjectId, status: r.sessionStatus }));
  const summary = summarize(pseudo, records, studentUid);
  const subs = await Promise.all(Object.keys(summary.bySubject).map(id => academic.getSubject(id).catch(() => null)));
  for (const s of subs.filter(Boolean)) Object.assign(summary.bySubject[s.subjectId], { subjectName: s.subjectName, subjectCode: s.subjectCode });
  const names = Object.fromEntries(subs.filter(Boolean).map(s => [s.subjectId, s.subjectName]));
  const history = records.filter(r => r.sessionStatus !== 'cancelled')
    .map(r => ({ date: r.date, subjectId: r.subjectId, subjectName: names[r.subjectId] || r.subjectId, status: r.status }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { summary, history };
}

// Per-student percentages for one subject (teacher/admin); flags < 75%.
async function subjectSummary(user, subjectId) {
  await authorizeSubject(user, subjectId);
  const [roster, records] = await Promise.all([academic.studentsOfSubject(subjectId), recordsCol.where('subjectId', '==', subjectId).get().then(data)]);
  const pseudo = records.map(r => ({ sessionId: r.sessionId, subjectId, status: r.sessionStatus }));
  const students = roster.map(st => {
    const s = summarize(pseudo, records, st.uid);
    return { ...st, conducted: s.conducted, attended: s.attended, percentage: s.percentage, low: s.low };
  });
  const sessions = new Set(records.filter(r => r.sessionStatus !== 'cancelled').map(r => r.sessionId));
  const avg = students.length ? Math.round(students.reduce((a, s) => a + s.percentage, 0) / students.length * 100) / 100 : 0;
  return { subjectId, sessionsConducted: sessions.size, students, belowThreshold: students.filter(s => s.low).length, averagePercentage: avg };
}

module.exports = { saveAttendance, listSessions, getSession, studentAttendance, subjectSummary };
