const router = require('express').Router();
const { Party } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');
const { validateGSTIN, STATE_CODES } = require('../utils/gst');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, type, search } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (type && type !== 'all') filter.party_type = { $in: [type, 'both'] };
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { gstin: { $regex: search, $options: 'i' } }];
    const data = await Party.find(filter).sort({ name: 1 }).lean();
    data.forEach(norm);
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, name, gstin, pan, email, phone, address, state_code, party_type, is_registered } = req.body;
    if (!business_id || !name) return res.status(400).json({ success: false, message: 'business_id and name required' });
    const party = await Party.create({ business_id, name, gstin: gstin?.toUpperCase(), pan, email, phone, address, state_code, party_type, is_registered: is_registered ?? 1 });
    res.json({ success: true, data: { id: String(party._id) }, message: 'Party created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/validate/:gstin', auth, (req, res) => {
  const gstin = req.params.gstin.toUpperCase();
  if (!validateGSTIN(gstin)) return res.json({ success: false, valid: false, message: 'Invalid GSTIN format' });
  const stateCode = gstin.substring(0, 2);
  res.json({ success: true, valid: true, data: { gstin, stateCode, state: STATE_CODES[stateCode], pan: gstin.substring(2, 12) } });
});

router.get('/:id', auth, async (req, res) => {
  const p = await Party.findById(req.params.id).lean();
  if (!p) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: norm(p) });
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, gstin, pan, email, phone, address, state_code, party_type, is_registered } = req.body;
    await Party.findByIdAndUpdate(req.params.id, { name, gstin: gstin?.toUpperCase(), pan, email, phone, address, state_code, party_type, is_registered });
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  await Party.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
