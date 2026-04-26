const router = require('express').Router();
const mongoose = require('mongoose');
const { Business, UserBusiness, User } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const { validateGSTIN } = require('../utils/gst');
const { generateComplianceCalendar } = require('../utils/compliance');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map(e => e.msg).join(', ');
    return res.status(400).json({ success: false, message });
  }
  next();
};

function normBiz(b) {
  const id = String(b._id);
  return { ...b, _id: id, id };
}

// -- List businesses -----------------------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    let businesses;
    if (req.user.role === 'admin') {
      businesses = await Business.find({ active: 1 }).lean();
    } else {
      const links = await UserBusiness.find({ user_id: req.user._id });
      const ids = links.map(l => l.business_id);
      businesses = await Business.find({ _id: { $in: ids }, active: 1 }).lean();
    }
    res.json({ success: true, data: businesses.map(normBiz) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Create business -----------------------------------------------------------
router.post('/', auth, requireRole('admin'), [
  body('gstin').trim().notEmpty().withMessage('GSTIN is required')
    .custom(v => {
      if (!validateGSTIN(v)) throw new Error('Invalid GSTIN format');
      return true;
    }),
  body('legal_name').trim().notEmpty().withMessage('Legal name is required'),
  body('state_code').trim().isLength({ min: 2, max: 2 }).withMessage('State code must be 2 characters'),
  validate
], async (req, res) => {
  try {
    const { gstin, legal_name, trade_name, address, state_code, pan, email, phone, registration_type, assignedUserIds } = req.body;
    const biz = await Business.create({
      gstin: gstin.toUpperCase(), legal_name, trade_name, address,
      state_code, pan, email, phone,
      registration_type: registration_type || 'Regular'
    });

    // Always link the creating admin
    await UserBusiness.create({ user_id: req.user._id, business_id: biz._id });

    // Assign any explicitly selected non-admin users
    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      const extraDocs = assignedUserIds
        .filter(uid => String(uid) !== String(req.user._id))
        .map(uid => ({ user_id: uid, business_id: biz._id }));
      if (extraDocs.length > 0) await UserBusiness.insertMany(extraDocs);
    }

    try {
      const now = new Date();
      const fy = now.getMonth() >= 3
        ? `${now.getFullYear()}-${(now.getFullYear()+1).toString().slice(2)}`
        : `${now.getFullYear()-1}-${now.getFullYear().toString().slice(2)}`;
      await generateComplianceCalendar(biz._id, fy);
    } catch(e) {}

    res.json({ success: true, data: { id: biz._id }, message: 'Business created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Get single business -------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const b = await Business.findById(req.params.id).lean();
    if (!b) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role !== 'admin') {
      const link = await UserBusiness.findOne({ user_id: req.user._id, business_id: req.params.id });
      if (!link) return res.status(403).json({ success: false, message: 'Access denied. You do not have access to this business.' });
    }
    res.json({ success: true, data: normBiz(b) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Update business details ---------------------------------------------------
router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { legal_name, trade_name, address, state_code, pan, email, phone } = req.body;
    await Business.findByIdAndUpdate(req.params.id, { legal_name, trade_name, address, state_code, pan, email, phone });
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Get assigned (non-admin) users for a business -----------------------------
router.get('/:id/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const links = await UserBusiness.find({ business_id: req.params.id }).lean();
    const userIds = links.map(l => l.user_id);
    // Exclude admins — they always have implicit access, no need to show in checklist
    const users = await User.find({ _id: { $in: userIds }, active: 1, role: { $ne: 'admin' } })
      .select('name email role').lean();
    res.json({ success: true, data: users.map(u => ({ ...u, id: String(u._id) })) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Replace user assignments for a business -----------------------------------
// Body: { userIds: ['id1', 'id2', ...] }
// Admins always keep their access — only non-admin links are replaced.
router.put('/:id/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const bizId = req.params.id;
    const biz = await Business.findById(bizId);
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found' });

    const { userIds = [] } = req.body;
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: 'userIds must be an array' });
    }

    // Collect all admin user IDs so we never touch their links
    const adminUsers = await User.find({ role: 'admin', active: 1 }).select('_id').lean();
    const adminIdStrings = adminUsers.map(u => String(u._id));

    // Delete only non-admin UserBusiness records for this business
    const adminObjectIds = adminIdStrings.map(id => new mongoose.Types.ObjectId(id));
    await UserBusiness.deleteMany({
      business_id: bizId,
      user_id: { $nin: adminObjectIds }
    });

    // Re-insert the selected users, skipping any admin IDs
    const nonAdminIds = userIds.filter(uid => !adminIdStrings.includes(String(uid)));
    if (nonAdminIds.length > 0) {
      const docs = nonAdminIds.map(uid => ({ user_id: uid, business_id: bizId }));
      await UserBusiness.insertMany(docs);
    }

    res.json({ success: true, message: 'Business assignments updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Add a single user to a business ------------------------------------------
router.post('/:id/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
    const biz = await Business.findById(req.params.id);
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found' });
    const user = await User.findById(userId);
    if (!user || !user.active) return res.status(404).json({ success: false, message: 'User not found' });
    await UserBusiness.findOneAndUpdate(
      { user_id: userId, business_id: req.params.id },
      { user_id: userId, business_id: req.params.id },
      { upsert: true }
    );
    res.json({ success: true, message: `${user.name} assigned to business` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// -- Remove a single user from a business -------------------------------------
router.delete('/:id/users/:userId', auth, requireRole('admin'), async (req, res) => {
  try {
    await UserBusiness.deleteOne({ user_id: req.params.userId, business_id: req.params.id });
    res.json({ success: true, message: 'User removed from business' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;