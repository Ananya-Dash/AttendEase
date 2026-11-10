const test = require('node:test');
const assert = require('node:assert');
const { percentage, summarize } = require('../attendanceCalc');

test('40 classes, 32 present = 80%', () => assert.strictEqual(percentage(32, 40), 80));
test('zero classes = 0, no crash', () => assert.strictEqual(percentage(0, 0), 0));
test('rounds to two decimals', () => assert.strictEqual(percentage(1, 3), 33.33));
test('excludes cancelled sessions and other students', () => {
  const sessions = [
    { sessionId: 'a', subjectId: 's1', status: 'completed' },
    { sessionId: 'b', subjectId: 's1', status: 'cancelled' },
    { sessionId: 'c', subjectId: 's1', status: 'completed' }];
  const records = [
    { sessionId: 'a', studentUid: 'u1', status: 'present' },
    { sessionId: 'b', studentUid: 'u1', status: 'absent' },
    { sessionId: 'c', studentUid: 'u1', status: 'absent' },
    { sessionId: 'a', studentUid: 'u2', status: 'present' }];
  const r = summarize(sessions, records, 'u1');
  assert.strictEqual(r.conducted, 2);
  assert.strictEqual(r.percentage, 50);
  assert.strictEqual(r.low, true);
});

