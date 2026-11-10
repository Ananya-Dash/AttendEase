const { db } = require('../config/firebaseAdmin');
const HttpError = require('../utils/httpError');
const V = require('../utils/validate');

const classes = db.collection('classes');
const subjects = db.collection('subjects');
const enrollments = db.collection('enrollments');
const data = s => s.docs.map(d => d.data());

async function createClass(b) {
  const ref = classes.doc();
  const doc = { classId: ref.id, className: V.str(b.className, 'className'), semester: V.str(b.semester, 'semester', { max: 20 }),
    academicYear: V.str(b.academicYear, 'academicYear', { max: 20 }), createdAt: new Date().toISOString() };
  await ref.set(doc); return doc;
}
async function updateClass(id, b) {
  const ref = classes.doc(id); if (!(await ref.get()).exists) throw new HttpError(404, 'Class not found');
  const p = {};
  if (b.className !== undefined) p.className = V.str(b.className, 'className');
  if (b.semester !== undefined) p.semester = V.str(b.semester, 'semester', { max: 20 });
  if (b.academicYear !== undefined) p.academicYear = V.str(b.academicYear, 'academicYear', { max: 20 });
  if (!Object.keys(p).length) throw new HttpError(400, 'Nothing to update');
  await ref.update(p); return (await ref.get()).data();
}

async function assertTeacher(uid) {
  const s = await db.collection('users').doc(uid).get();
  if (!s.exists || s.data().role !== 'teacher' || s.data().status !== 'active') throw new HttpError(400, 'teacherUid must be an active teacher');
}
async function createSubject(b) {
  const classId = V.str(b.classId, 'classId');
  if (!(await classes.doc(classId).get()).exists) throw new HttpError(400, 'Class does not exist');
  let teacherUid = null;
  if (b.teacherUid) { teacherUid = V.str(b.teacherUid, 'teacherUid'); await assertTeacher(teacherUid); }
  const ref = subjects.doc();
  const doc = { subjectId: ref.id, subjectName: V.str(b.subjectName, 'subjectName'), subjectCode: V.str(b.subjectCode, 'subjectCode', { max: 20 }).toUpperCase(),
    classId, teacherUid, createdAt: new Date().toISOString() };
  const dup = await subjects.where('classId', '==', classId).where('subjectCode', '==', doc.subjectCode).limit(1).get();
  if (!dup.empty) throw new HttpError(409, 'Subject code already exists in this class');
  await ref.set(doc); return doc;
}
async function updateSubject(id, b) {
  const ref = subjects.doc(id); if (!(await ref.get()).exists) throw new HttpError(404, 'Subject not found');
  const p = {};
  if (b.subjectName !== undefined) p.subjectName = V.str(b.subjectName, 'subjectName');
  if (b.subjectCode !== undefined) p.subjectCode = V.str(b.subjectCode, 'subjectCode', { max: 20 }).toUpperCase();
  if (b.teacherUid !== undefined) { // assign / unassign teacher
    if (b.teacherUid === null) p.teacherUid = null; else { await assertTeacher(b.teacherUid); p.teacherUid = b.teacherUid; }
  }
  if (!Object.keys(p).length) throw new HttpError(400, 'Nothing to update');
  await ref.update(p); return (await ref.get()).data();
}

// Role-scoped listings
async function listSubjects(user, { classId } = {}) {
  if (user.role === 'admin') {
    const s = classId ? await subjects.where('classId', '==', classId).get() : await subjects.get();
    return data(s);
  }
  if (user.role === 'teacher') {
    const list = data(await subjects.where('teacherUid', '==', user.uid).get());
    return classId ? list.filter(s => s.classId === classId) : list;
  }
  const en = data(await enrollments.where('studentUid', '==', user.uid).get());
  const ids = [...new Set(en.map(e => e.subjectId))];
  const docs = await Promise.all(ids.map(id => subjects.doc(id).get()));
  const list = docs.filter(d => d.exists).map(d => d.data());
  return classId ? list.filter(s => s.classId === classId) : list;
}
async function listClasses(user) {
  if (user.role === 'admin') return data(await classes.get());
  const subs = await listSubjects(user);
  const ids = [...new Set(subs.map(s => s.classId))];
  const docs = await Promise.all(ids.map(id => classes.doc(id).get()));
  return docs.filter(d => d.exists).map(d => d.data());
}

async function enroll({ studentUid, classId, subjectIds }) {
  studentUid = V.str(studentUid, 'studentUid'); classId = V.str(classId, 'classId');
  if (!Array.isArray(subjectIds) || !subjectIds.length) throw new HttpError(400, 'subjectIds must be a non-empty array');
  const st = await db.collection('users').doc(studentUid).get();
  if (!st.exists || st.data().role !== 'student') throw new HttpError(400, 'studentUid must be a student');
  const batch = db.batch();
  for (const sid of subjectIds) {
    const sub = await subjects.doc(String(sid)).get();
    if (!sub.exists || sub.data().classId !== classId) throw new HttpError(400, `Subject ${sid} does not belong to the class`);
    batch.set(enrollments.doc(`${studentUid}_${sid}`), { enrollmentId: `${studentUid}_${sid}`, studentUid, classId, subjectId: sid, createdAt: new Date().toISOString() });
  }
  await batch.commit();
  return { enrolled: subjectIds.length };
}
async function unenroll(id) {
  const ref = enrollments.doc(id); if (!(await ref.get()).exists) throw new HttpError(404, 'Enrollment not found');
  await ref.delete();
}
// Enrolled students (with profile) for a subject; caller must already be authorised for the subject.
async function studentsOfSubject(subjectId) {
  const en = data(await enrollments.where('subjectId', '==', subjectId).get());
  const docs = await Promise.all(en.map(e => db.collection('users').doc(e.studentUid).get()));
  return docs.filter(d => d.exists && d.data().status === 'active')
    .map(d => ({ uid: d.id, fullName: d.data().fullName, studentId: d.data().studentId }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
async function getSubject(id) {
  const s = await subjects.doc(id).get(); if (!s.exists) throw new HttpError(404, 'Subject not found'); return s.data();
}
async function listEnrollments({ subjectId, studentUid }) {
  let r = enrollments; if (subjectId) r = r.where('subjectId', '==', subjectId); if (studentUid) r = r.where('studentUid', '==', studentUid);
  return data(await r.get());
}
module.exports = { createClass, updateClass, createSubject, updateSubject, listSubjects, listClasses, enroll, unenroll, studentsOfSubject, getSubject, listEnrollments };
