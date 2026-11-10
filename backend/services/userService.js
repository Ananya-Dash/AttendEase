const { db, auth } = require('../config/firebaseAdmin');
const HttpError = require('../utils/httpError');
const V = require('../utils/validate');

const users = db.collection('users');
const ROLES = ['student', 'teacher'];

async function createUser(body) {
  const role = V.oneOf(body.role, 'role', ROLES); // admins are never created via API (see seed/setup script)
  const fullName = V.str(body.fullName, 'fullName');
  const email = V.email(body.email);
  const pw = V.password(body.password);
  const idField = role === 'student' ? 'studentId' : 'teacherId';
  const idValue = V.str(body[idField], idField, { max: 30 });

  const dup = await users.where(idField, '==', idValue).limit(1).get();
  if (!dup.empty) throw new HttpError(409, `${idField} already exists`);

  let rec;
  try { rec = await auth.createUser({ email, password: pw, displayName: fullName }); }
  catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpError(409, 'Email already in use');
    throw new HttpError(400, e.message);
  }
  const doc = { uid: rec.uid, fullName, email, role, [idField]: idValue, status: 'active', createdAt: new Date().toISOString() };
  try { await users.doc(rec.uid).set(doc); }
  catch (e) { await auth.deleteUser(rec.uid).catch(() => {}); throw e; } // no orphan auth accounts
  return doc;
}

async function listUsers({ role, q, status }) {
  let ref = users;
  if (role) ref = ref.where('role', '==', V.oneOf(role, 'role', ['admin', ...ROLES]));
  if (status) ref = ref.where('status', '==', V.oneOf(status, 'status', ['active', 'inactive']));
  const snap = await ref.get();
  let list = snap.docs.map(d => d.data());
  if (q) { // Firestore has no substring search; filter in memory (fine for college-scale data)
    const s = String(q).toLowerCase();
    list = list.filter(u => [u.fullName, u.studentId, u.teacherId, u.email].some(x => x && x.toLowerCase().includes(s)));
  }
  return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function getUser(uid) {
  const s = await users.doc(uid).get();
  if (!s.exists) throw new HttpError(404, 'User not found');
  return s.data();
}

async function updateUser(uid, body) {
  const u = await getUser(uid);
  if (u.role === 'admin') throw new HttpError(403, 'Admin accounts cannot be edited here');
  const patch = {};
  if (body.fullName !== undefined) patch.fullName = V.str(body.fullName, 'fullName');
  const idField = u.role === 'student' ? 'studentId' : 'teacherId';
  if (body[idField] !== undefined) {
    const v = V.str(body[idField], idField, { max: 30 });
    const dup = await users.where(idField, '==', v).limit(2).get();
    if (dup.docs.some(d => d.id !== uid)) throw new HttpError(409, `${idField} already exists`);
    patch[idField] = v;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  await users.doc(uid).update(patch);
  if (patch.fullName) await auth.updateUser(uid, { displayName: patch.fullName });
  return { ...u, ...patch };
}

async function setStatus(actingUid, uid, status) {
  V.oneOf(status, 'status', ['active', 'inactive']);
  if (actingUid === uid) throw new HttpError(400, 'You cannot change your own status');
  const u = await getUser(uid);
  if (u.role === 'admin') throw new HttpError(403, 'Admin accounts cannot be changed here');
  await users.doc(uid).update({ status });
  await auth.updateUser(uid, { disabled: status === 'inactive' });
  return { ...u, status };
}

module.exports = { createUser, listUsers, getUser, updateUser, setStatus };
