const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler: h } = require('../utils/validate');
const users = require('../controllers/userController');
const academic = require('../controllers/academicController');
const att = require('../controllers/attendanceController');
const dash = require('../controllers/dashboardController');

const admin = requireRole('admin');
const staff = requireRole('admin', 'teacher');
router.use(authenticate); // every /api route requires a verified token

router.get('/me', (req, res) => {
  const { uid, fullName, email, role, studentId, teacherId } = req.user;
  res.json({ uid, fullName, email, role, studentId, teacherId });
});

// Users (admin manages; self-read allowed)
router.post('/users', admin, h(users.create));
router.get('/users', admin, h(users.list));
router.get('/users/:uid', h(users.get));
router.patch('/users/:uid', admin, h(users.update));
router.patch('/users/:uid/status', admin, h(users.setStatus));

// Classes, subjects, enrollments
router.get('/classes', h(academic.listClasses));
router.post('/classes', admin, h(academic.createClass));
router.patch('/classes/:id', admin, h(academic.updateClass));
router.get('/subjects', h(academic.listSubjects));
router.post('/subjects', admin, h(academic.createSubject));
router.patch('/subjects/:id', admin, h(academic.updateSubject)); // also assigns teacher
router.get('/subjects/:id/students', staff, h(academic.subjectStudents));
router.get('/enrollments', admin, h(academic.listEnrollments));
router.post('/enrollments', admin, h(academic.enroll));
router.delete('/enrollments/:id', admin, h(academic.unenroll));

// Attendance
router.post('/attendance', staff, h(att.create));
router.put('/attendance', staff, h(att.update));
router.get('/attendance/sessions', staff, h(att.sessions));
router.get('/attendance/sessions/:id', staff, h(att.session));
router.get('/attendance/subject/:id/summary', staff, h(att.bySubject));
router.get('/attendance/student/:uid', h(att.byStudent)); // student: self only (enforced in service)

// Dashboards
router.get('/dashboard/admin', admin, h(dash.admin));
router.get('/dashboard/teacher', requireRole('teacher'), h(dash.teacher));
router.get('/dashboard/student', requireRole('student'), h(dash.student));

module.exports = router;
