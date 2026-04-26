const { validationResult } = require('express-validator');

const validateReq = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(e => `${e.path}: ${e.msg}`);
    return res.status(400).json({ success: false, message: errorMessages.join(', ') });
  }
  next();
};

module.exports = { validateReq };
