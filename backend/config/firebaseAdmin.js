const admin = require('firebase-admin');
// Uses Application Default Credentials (Cloud Run service account, or gcloud ADC locally).
if (!admin.apps.length) admin.initializeApp();
module.exports = { admin, db: admin.firestore(), auth: admin.auth() };
