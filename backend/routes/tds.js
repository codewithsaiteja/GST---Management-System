const router = require('express').Router();
const { TdsTcs, Party } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, period, entry_type } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (period) filter.period = period;
    if (entry_type) filter.entry_type = entry_type;
    const rows = await TdsTcs.find(filter).sort({ created_at: -1 }).lean();
    for (const r of rows) {
      norm(r);
      if (r.party_id) { const p = await Party.findById(r.party_id).select('name').lean(); r.party_name = p?.name; }
    }
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, entry_type, party_id, invoice_id, section, base_amount, rate, period } = req.body;
    if (!business_id || !entry_type || !base_amount || !rate || !period) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const amount = parseFloat(((base_amount * rate) / 100).toFixed(2));
    const t = await TdsTcs.create({ business_id, entry_type, party_id: party_id||null, invoice_id: invoice_id||null, section, base_amount, rate, amount, period });
    res.json({ success: true, data: { id: String(t._id), amount }, message: `${entry_type} entry created` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/summary', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, period } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const match = { business_id };
    if (period) match.period = period;
    const data = await TdsTcs.aggregate([
      { $match: match },
      { $group: { _id: { entry_type: '$entry_type', section: '$section' }, entries: { $sum: 1 }, base: { $sum: '$base_amount' }, tds_tcs: { $sum: '$amount' } } },
      { $project: { entry_type: '$_id.entry_type', section: '$_id.section', entries: 1, base: 1, tds_tcs: 1, _id: 0 } }
    ]);
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  await TdsTcs.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
