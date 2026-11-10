const { auth, db } = require('../config/firebaseAdmin');
const HttpError = require('../utils/httpError');

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new HttpError(401, 'Missing bearer token');
    let claims;
    try { claims = await auth.verifyIdToken(match[1]); }
    catch { throw new HttpError(401, 'Invalid or expired token'); }
    const snap = await db.collection('users').doc(claims.uid).get();
    if (!snap.exists || snap.data().status !== 'active') throw new HttpError(403, 'No active user profile');
    const profile = snap.data();
    req.user = { uid: claims.uid, email: profile.email || claims.email, ...profile };
    next();
  } catch (err) { next(err); }
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : next(new HttpError(403, 'You do not have permission to perform this action'));
}

module.exports = { authenticate, requireRole };
