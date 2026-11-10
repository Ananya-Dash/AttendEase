// Repeatable sample-data seed (fictional people). Idempotent: fixed IDs, safe to re-run.
//   Emulator:   SEED_PASSWORD='...' node scripts/seed.js
//   Real project (writes real accounts!): SEED_PASSWORD='...' node scripts/seed.js --allow-production
// The password comes from the environment only; nothing is hardcoded. Create the admin with create-admin.js.
const path = require('path');
const admin = require(path.join(__dirname, '../backend/node_modules/firebase-admin'));

const TEACHERS = [
  { key: 't1', fullName: 'Dr. Meera Iyer', email: 'meera.iyer@example.edu', teacherId: 'T001' },
  { key: 't2', fullName: 'Prof. Arjun Menon', email: 'arjun.menon@example.edu', teacherId: 'T002' }];
const STUDENT_NAMES = ['Aarav Sharma', 'Diya Nair', 'Kabir Verma', 'Ishita Rao', 'Rohan Gupta',
  'Ananya Das', 'Vihaan Kulkarni', 'Meghna Joshi', 'Aditya Singh', 'Tara Pillai'];
const CLASSES = [
  { classId: 'cse-s5-a', className: 'B.Tech CSE Section A', semester: '5', academicYear: '2026-27' },
  { classId: 'cse-s3-a', className: 'B.Tech CSE Section A', semester: '3', academicYear: '2026-27' }];
const SUBJECTS = [
  { subjectId: 'cc501', subjectName: 'Cloud Computing', subjectCode: 'CC501', classId: 'cse-s5-a', teacher: 't1' },
  { subjectId: 'db502', subjectName: 'Database Systems', subjectCode: 'DB502', classId: 'cse-s5-a', teacher: 't1' },
  { subjectId: 'ds301', subjectName: 'Data Structures', subjectCode: 'DS301', classId: 'cse-s3-a', teacher: 't2' },
  { subjectId: 'os302', subjectName: 'Operating Systems', subjectCode: 'OS302', classId: 'cse-s3-a', teacher: 't2' }];
const DATES = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'];
const LOW_ATTENDERS = new Set([3, 8]); // students #4 and #9 end up below 75%

function rng(seed) { // deterministic PRNG so every run produces identical attendance
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function ensureUser(rec) {
  const auth = admin.auth();
  let u;
  try { u = await auth.getUserByEmail(rec.email); }
  catch { u = await auth.createUser({ email: rec.email, password: process.env.SEED_PASSWORD, displayName: rec.fullName }); }
  return u.uid;
}

async function seed() {
  if (!admin.apps.length) admin.initializeApp(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 8) throw new Error('Set SEED_PASSWORD (min 8 chars) in the environment');
  const db = admin.firestore(); const now = new Date().toISOString();
  const teacherUid = {}, students = [];

  for (const t of TEACHERS) {
    const uid = await ensureUser(t); teacherUid[t.key] = uid;
    await db.collection('users').doc(uid).set({ uid, fullName: t.fullName, email: t.email, role: 'teacher', teacherId: t.teacherId, status: 'active', createdAt: now }, { merge: true });
  }
  for (const [i, name] of STUDENT_NAMES.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const rec = { fullName: name, email: `student${n}@example.edu`, studentId: `S2026${n}` };
    const uid = await ensureUser(rec);
    students.push({ uid, classId: i < 5 ? 'cse-s5-a' : 'cse-s3-a', idx: i });
    await db.collection('users').doc(uid).set({ uid, ...rec, role: 'student', status: 'active', createdAt: now }, { merge: true });
  }
  for (const c of CLASSES) await db.collection('classes').doc(c.classId).set({ ...c, createdAt: now });
  for (const s of SUBJECTS) {
    const { teacher, ...rest } = s;
    await db.collection('subjects').doc(s.subjectId).set({ ...rest, teacherUid: teacherUid[teacher], createdAt: now });
  }
  for (const st of students) for (const s of SUBJECTS.filter(x => x.classId === st.classId)) {
    const id = `${st.uid}_${s.subjectId}`;
    await db.collection('enrollments').doc(id).set({ enrollmentId: id, studentUid: st.uid, classId: st.classId, subjectId: s.subjectId, createdAt: now });
  }
  // Sessions: 8 completed per subject, plus one cancelled CC501 session (must not affect percentages).
  const rand = rng(2026);
  let writes = 0;
  for (const s of SUBJECTS) {
    const roster = students.filter(st => st.classId === s.classId);
    const dates = s.subjectId === 'cc501' ? [...DATES, '2026-10-15'] : DATES;
    for (const date of dates) {
      const status = date === '2026-10-15' ? 'cancelled' : 'completed';
      const sessionId = `${s.subjectId}_${date}`;
      const batch = db.batch();
      batch.set(db.collection('attendanceSessions').doc(sessionId), { sessionId, classId: s.classId, subjectId: s.subjectId,
        teacherUid: teacherUid[s.teacher], date, status, createdAt: now, updatedAt: now });
      for (const st of roster) {
        const present = rand() < (LOW_ATTENDERS.has(st.idx) ? 0.5 : 0.92);
        const id = `${sessionId}_${st.uid}`;
        batch.set(db.collection('attendanceRecords').doc(id), { recordId: id, sessionId, subjectId: s.subjectId, classId: s.classId, date,
          studentUid: st.uid, status: present ? 'present' : 'absent', sessionStatus: status, createdAt: now, updatedAt: now });
      }
      await batch.commit(); writes++;
    }
  }
  return { teacherUid, students, sessions: writes };
}
module.exports = { seed };

if (require.main === module) {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!emulator && !process.argv.includes('--allow-production')) {
    console.error('Refusing to seed a real project. Use the emulators, or pass --allow-production deliberately.'); process.exit(1);
  }
  seed().then(r => { console.log(`Seeded: ${r.students.length} students, 2 teachers, ${r.sessions} sessions. Login emails: student01..10@example.edu, meera.iyer@example.edu, arjun.menon@example.edu`); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
