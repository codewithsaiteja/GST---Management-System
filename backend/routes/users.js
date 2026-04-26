const router = require('express').Router();
const { User } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.get('/', auth, requireRole('admin'), async (req, res) => {
  const data = await User.find().select('name email role active created_at').sort({ name: 1 }).lean();
  res.json({ success: true, data });
});

router.post('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password required' });
    if (!['admin','accountant','viewer'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
    const hash = bcrypt.hashSync(password, 10);
    const u = await User.create({ name, email: email.toLowerCase(), password: hash, role });
    res.json({ success: true, data: { id: u._id }, message: 'User created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { name, role, active } = req.body;
    if (req.params.id === String(req.user._id) && active === 0) return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    const cur = await User.findById(req.params.id);
    if (!cur) return res.status(404).json({ success: false, message: 'Not found' });
    await User.findByIdAndUpdate(req.params.id, { name: name||cur.name, role: role||cur.role, active: active??cur.active });
    res.json({ success: true, message: 'User updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  if (req.params.id === String(req.user._id)) return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  await User.findByIdAndUpdate(req.params.id, { active: 0 });
  res.json({ success: true, message: 'User deactivated' });
});

module.exports = router;
