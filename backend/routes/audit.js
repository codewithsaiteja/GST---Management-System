const router = require('express').Router();
const { AuditLog, User } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { business_id, entity_type, user_id, limit = 100, page = 1 } = req.query;
    const filter = {};
    if (business_id) filter.business_id = business_id;
    if (entity_type) filter.entity_type = entity_type;
    if (user_id) filter.user_id = user_id;
    const rows = await AuditLog.find(filter).sort({ created_at: -1 }).skip((page-1)*limit).limit(parseInt(limit)).lean();
    for (const r of rows) {
      if (r.user_id) { const u = await User.findById(r.user_id).select('name email').lean(); r.user_name = u?.name; r.user_email = u?.email; }
    }
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
