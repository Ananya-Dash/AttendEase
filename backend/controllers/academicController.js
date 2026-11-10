const a = require('../services/academicService');
const HttpError = require('../utils/httpError');

exports.createClass = async (req, res) => res.status(201).json(await a.createClass(req.body));
exports.updateClass = async (req, res) => res.json(await a.updateClass(req.params.id, req.body));
exports.listClasses = async (req, res) => res.json(await a.listClasses(req.user));
exports.createSubject = async (req, res) => res.status(201).json(await a.createSubject(req.body));
exports.updateSubject = async (req, res) => res.json(await a.updateSubject(req.params.id, req.body));
exports.listSubjects = async (req, res) => res.json(await a.listSubjects(req.user, req.query));
exports.subjectStudents = async (req, res) => {
  const subject = await a.getSubject(req.params.id);
  if (req.user.role === 'teacher' && subject.teacherUid !== req.user.uid) throw new HttpError(403, 'You are not assigned to this subject');
  res.json(await a.studentsOfSubject(req.params.id));
};
exports.enroll = async (req, res) => res.status(201).json(await a.enroll(req.body));
exports.unenroll = async (req, res) => { await a.unenroll(req.params.id); res.status(204).end(); };
exports.listEnrollments = async (req, res) => res.json(await a.listEnrollments(req.query));
