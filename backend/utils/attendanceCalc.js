// Pure functions: easy to unit test. Cancelled sessions are excluded.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function percentage(attended, conducted) {
  if (!conducted) return 0;
  return round2((attended / conducted) * 100);
}

// sessions: [{sessionId, subjectId, status}], records: [{sessionId, studentUid, status}]
function summarize(sessions, records, studentUid) {
  const valid = new Map(sessions.filter(s => s.status !== 'cancelled').map(s => [s.sessionId, s]));
  const bySubject = {};
  let conducted = 0, attended = 0;
  for (const r of records) {
    if (r.studentUid !== studentUid) continue;
    const s = valid.get(r.sessionId);
    if (!s) continue;
    const b = (bySubject[s.subjectId] ||= { conducted: 0, attended: 0 });
    b.conducted++; conducted++;
    if (r.status === 'present') { b.attended++; attended++; }
  }
  for (const b of Object.values(bySubject)) { b.percentage = percentage(b.attended, b.conducted); b.low = b.percentage < 75; }
  const overall = percentage(attended, conducted);
  return { conducted, attended, percentage: overall, low: conducted > 0 && overall < 75, bySubject };
}

module.exports = { percentage, summarize };
