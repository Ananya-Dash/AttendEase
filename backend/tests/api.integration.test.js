// Runs only against the Firebase emulators:  npm run test:emulator
const test = require('node:test');
const assert = require('node:assert');
const skip = !(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST) && 'emulators not running (use npm run test:emulator)';

test('API access control and attendance rules', { skip }, async t => {
  process.env.GOOGLE_CLOUD_PROJECT ||= 'demo-attendance';
  process.env.SEED_PASSWORD = 'Test-only-pass-1';
  const { seed } = require('../../scripts/seed');
  const { createAdmin } = require('../../scripts/create-admin');
  await seed();
  await createAdmin({ email: 'admin@example.edu', password: process.env.SEED_PASSWORD });

  const server = require('../app').listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(() => server.close());

  const login = async email => {
    const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.SEED_PASSWORD, returnSecureToken: true }) });
    return (await r.json()).idToken;
  };
  const call = async (token, method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const [adminT, t1, t2, s1, s2] = await Promise.all(['admin@example.edu', 'meera.iyer@example.edu', 'arjun.menon@example.edu', 'student01@example.edu', 'student02@example.edu'].map(login));
  const s1uid = (await call(s1, 'GET', '/me')).body.uid;
  const s2uid = (await call(s2, 'GET', '/me')).body.uid;

  await t.test('no token / bad token -> 401', async () => {
    assert.strictEqual((await call(null, 'GET', '/me')).status, 401);
    assert.strictEqual((await call('garbage', 'GET', '/me')).status, 401);
  });
  await t.test('student cannot use admin endpoints or see another student', async () => {
    assert.strictEqual((await call(s1, 'GET', '/users')).status, 403);
    assert.strictEqual((await call(s1, 'POST', '/attendance', {})).status, 403);
    assert.strictEqual((await call(s1, 'GET', `/attendance/student/${s2uid}`)).status, 403);
    assert.strictEqual((await call(s1, 'GET', `/attendance/student/${s1uid}`)).status, 200);
  });
  await t.test('teacher cannot touch an unassigned subject', async () => {
    const r = await call(t1, 'POST', '/attendance', { subjectId: 'ds301', date: '2026-10-20', records: [] });
    assert.strictEqual(r.status, 403);
    assert.strictEqual((await call(t1, 'GET', '/attendance/subject/ds301/summary')).status, 403);
  });
  await t.test('duplicate session -> 409, update works and changes percentage', async () => {
    const roster = (await call(t1, 'GET', '/subjects/cc501/students')).body;
    const mark = status => ({ subjectId: 'cc501', date: '2026-10-20', records: roster.map(s => ({ studentUid: s.uid, status })) });
    assert.strictEqual((await call(t1, 'POST', '/attendance', mark('present'))).status, 201);
    assert.strictEqual((await call(t1, 'POST', '/attendance', mark('present'))).status, 409);
    const before = (await call(s1, 'GET', `/attendance/student/${s1uid}`)).body.summary.bySubject.cc501;
    assert.strictEqual((await call(t1, 'PUT', '/attendance', mark('absent'))).status, 200);
    const after = (await call(s1, 'GET', `/attendance/student/${s1uid}`)).body.summary.bySubject.cc501;
    assert.strictEqual(after.conducted, before.conducted);          // no duplicate session
    assert.ok(after.percentage < before.percentage);                // edit recalculated
  });
  await t.test('cancelled seed session is excluded (cc501: 8 seeded + 1 new = 9 conducted)', async () => {
    const s = (await call(s1, 'GET', `/attendance/student/${s1uid}`)).body.summary.bySubject.cc501;
    assert.strictEqual(s.conducted, 9);
  });
  await t.test('admin dashboard returns totals; admin can create a student; role cannot be injected', async () => {
    const d = await call(adminT, 'GET', '/dashboard/admin');
    assert.strictEqual(d.body.totals.students, 10);
    const c = await call(adminT, 'POST', '/users', { role: 'student', fullName: 'Test Person', email: 'new.student@example.edu', password: 'Another-pass-1', studentId: 'S999' });
    assert.strictEqual(c.status, 201);
    assert.strictEqual((await call(adminT, 'POST', '/users', { role: 'admin', fullName: 'X', email: 'x@example.edu', password: 'Another-pass-1' })).status, 400);
    assert.strictEqual((await call(t2, 'POST', '/users', {})).status, 403);
  });
});
