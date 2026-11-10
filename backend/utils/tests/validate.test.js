const test = require('node:test');
const assert = require('node:assert');
const v = require('../validate');

test('date accepts valid, rejects impossible dates', () => {
  assert.strictEqual(v.date('2026-02-28'), '2026-02-28');
  assert.throws(() => v.date('2026-02-30'), /invalid/);
  assert.throws(() => v.date('28-02-2026'), /YYYY-MM-DD/);
});
test('email normalizes and validates', () => {
  assert.strictEqual(v.email(' A@B.com '), 'a@b.com');
  assert.throws(() => v.email('nope'));
});
test('password minimum length', () => assert.throws(() => v.password('short')));
test('oneOf', () => assert.throws(() => v.oneOf('x', 'status', ['present', 'absent'])));

