// Secure first-admin setup. Run once from your own machine; there is no public admin registration.
//   ADMIN_EMAIL=you@college.edu ADMIN_PASSWORD='choose-a-strong-one' node scripts/create-admin.js
// Real project: `gcloud auth application-default login` first. Emulator: set FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST.
const path = require('path');
const admin = require(path.join(__dirname, '../backend/node_modules/firebase-admin'));

async function createAdmin({ email, password, fullName = 'System Administrator' }) {
  if (!admin.apps.length) admin.initializeApp(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);
  if (!email || !password || password.length < 8) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) are required');
  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch { user = await admin.auth().createUser({ email, password, displayName: fullName }); }
  await admin.firestore().collection('users').doc(user.uid).set(
    { uid: user.uid, fullName, email, role: 'admin', status: 'active', createdAt: new Date().toISOString() }, { merge: true });
  return user.uid;
}
module.exports = { createAdmin };

if (require.main === module) {
  createAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    .then(uid => { console.log('Admin ready:', uid); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
