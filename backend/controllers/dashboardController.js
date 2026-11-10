const d = require('../services/dashboardService');
exports.admin = async (req, res) => res.json(await d.admin());
exports.teacher = async (req, res) => res.json(await d.teacher(req.user));
exports.student = async (req, res) => res.json(await d.student(req.user));
