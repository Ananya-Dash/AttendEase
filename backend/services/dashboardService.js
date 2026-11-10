const { db } = require('../config/firebaseAdmin');
const academic = require('./academicService');
const attendance = require('./attendanceService');
const { percentage } = require('../utils/attendanceCalc');

const count = async q => (await q.count().get()).data().count;
const users = db.collection('users');
const records = db.collection('attendanceRecords');

async function admin() {
  const [students, teachers, classes, subjects] = await Promise.all([
    count(users.where('role', '==', 'student').where('status', '==', 'active')),
    count(users.where('role', '==', 'teacher').where('status', '==', 'active')),
    count(db.collection('classes')), count(db.collection('subjects'))]);
  const subs = (await db.collection('subjects').get()).docs.map(d => d.data());
  const bySubject = await Promise.all(subs.map(async s => {
    const base = records.where('subjectId', '==', s.subjectId).where('sessionStatus', '==', 'completed');
    const [present, total] = await Promise.all([count(base.where('status', '==', 'present')), count(base)]);
    return { subjectId: s.subjectId, subjectName: s.subjectName, present, absent: total - present, percentage: percentage(present, total) };
  }));
  const present = bySubject.reduce((a, s) => a + s.present, 0), absent = bySubject.reduce((a, s) => a + s.absent, 0);
  return { totals: { students, teachers, classes, subjects }, overall: { present, absent, percentage: percentage(present, present + absent) }, bySubject };
}

async function teacher(user) {
  const subjects = await academic.listSubjects(user);
  const summaries = await Promise.all(subjects.map(s => attendance.subjectSummary(user, s.subjectId)));
  return {
    totals: { subjects: subjects.length, classes: new Set(subjects.map(s => s.classId)).size,
      students: new Set(summaries.flatMap(s => s.students.map(x => x.uid))).size },
    subjects: subjects.map((s, i) => ({ ...s, sessionsConducted: summaries[i].sessionsConducted,
      averagePercentage: summaries[i].averagePercentage, belowThreshold: summaries[i].belowThreshold }))
  };
}

async function student(user) {
  const { summary } = await attendance.studentAttendance(user, user.uid);
  const subs = await academic.listSubjects(user);
  return { profile: { fullName: user.fullName, studentId: user.studentId, email: user.email }, enrolledSubjects: subs, ...summary,
    warning: summary.low ? 'Your overall attendance is below 75%.' : null };
}
module.exports = { admin, teacher, student };
