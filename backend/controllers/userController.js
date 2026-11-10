const users = require('../services/userService');
const HttpError = require('../utils/httpError');

exports.create = async (req, res) => res.status(201).json(await users.createUser(req.body));
exports.list = async (req, res) => res.json(await users.listUsers(req.query));
exports.get = async (req, res) => {
  if (req.user.role !== 'admin' && req.user.uid !== req.params.uid) throw new HttpError(403, 'Forbidden');
  res.json(await users.getUser(req.params.uid));
};
exports.update = async (req, res) => res.json(await users.updateUser(req.params.uid, req.body));
exports.setStatus = async (req, res) => res.json(await users.setStatus(req.user.uid, req.params.uid, req.body.status));
