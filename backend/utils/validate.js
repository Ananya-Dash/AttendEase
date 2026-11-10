const HttpError = require('./httpError');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function str(value, name, { min = 1, max = 120 } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${name} is required`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`);
  return v;
}
function email(value) {
  const v = str(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, 'email is invalid');
  return v;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 8) throw new HttpError(400, 'password must be at least 8 characters');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'date must be YYYY-MM-DD');
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'date is invalid');
  return value;
}
function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) throw new HttpError(400, `${name} must be one of: ${allowed.join(', ')}`);
  return value;
}
module.exports = { asyncHandler, str, email, password, date, oneOf };
