const att = require('../services/attendanceService');

exports.create = async (req, res) => res.status(201).json(await att.saveAttendance(req.user, req.body, 'create'));
exports.update = async (req, res) => res.json(await att.saveAttendance(req.user, req.body, 'update'));
exports.sessions = async (req, res) => res.json(await att.listSessions(req.user, req.query));
exports.session = async (req, res) => res.json(await att.getSession(req.user, req.params.id));
exports.byStudent = async (req, res) => res.json(await att.studentAttendance(req.user, req.params.uid, req.query));
exports.bySubject = async (req, res) => res.json(await att.subjectSummary(req.user, req.params.id));
