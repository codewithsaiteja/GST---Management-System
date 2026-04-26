const router = require('express').Router();
const { Compliance } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, status, year } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (status) filter.status = status;
    if (year) filter.due_date = { $regex: `^${year}` };
    const rows = await Compliance.find(filter).sort({ due_date: 1 }).lean();
    rows.forEach(norm);
    const today = new Date().toISOString().split('T')[0];
    const upcoming = rows.filter(r => r.due_date >= today && r.status === 'pending').slice(0, 5);
    res.json({ success: true, data: rows, upcoming });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/filed', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const comp = await Compliance.findByIdAndUpdate(req.params.id, { status: 'filed', filed_date: today });
    if (!comp) return res.status(404).json({ success: false, message: 'Compliance entry not found' });
    res.json({ success: true, message: 'Marked as filed' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to mark as filed: ' + e.message });
  }
});

module.exports = router;
