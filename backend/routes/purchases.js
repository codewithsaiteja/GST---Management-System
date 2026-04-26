const router = require('express').Router();
const { Purchase, Party } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, from_date, to_date, match_status } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (from_date || to_date) { filter.invoice_date = {}; if (from_date) filter.invoice_date.$gte = from_date; if (to_date) filter.invoice_date.$lte = to_date; }
    if (match_status) filter.match_status = match_status;
    const rows = await Purchase.find(filter).sort({ invoice_date: -1 }).lean();
    for (const r of rows) {
      norm(r);
      if (r.party_id) { const p = await Party.findById(r.party_id).select('name').lean(); r.party_name_resolved = p?.name; }
    }
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, invoice_number, invoice_date, party_id, party_gstin, taxable_value, cgst, sgst, igst, cess, itc_eligible } = req.body;
    if (!business_id || !invoice_number || !invoice_date) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const total = parseFloat(((taxable_value||0)+(cgst||0)+(sgst||0)+(igst||0)+(cess||0)).toFixed(2));
    const p = await Purchase.create({ business_id, invoice_number, invoice_date, party_id: party_id||null, party_gstin, taxable_value: taxable_value||0, cgst: cgst||0, sgst: sgst||0, igst: igst||0, cess: cess||0, total_amount: total, itc_eligible: itc_eligible??1, created_by: req.user._id });
    res.json({ success: true, data: { id: String(p._id) }, message: 'Purchase invoice created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, requireBizAccess, async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.body.business_id || req.query.business_id;
      if (String(purchase.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    const { invoice_number, invoice_date, supplier_name, party_gstin, taxable_value, cgst, sgst, igst, cess, itc_eligible } = req.body;
    const total = parseFloat((parseFloat(taxable_value)+parseFloat(cgst)+parseFloat(sgst)+parseFloat(igst)+parseFloat(cess||0)).toFixed(2));
    await Purchase.findByIdAndUpdate(req.params.id, { invoice_number, invoice_date, supplier_name, party_gstin, taxable_value, cgst, sgst, igst, cess: cess||0, total_amount: total, itc_eligible: itc_eligible?1:0 });
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, requireBizAccess, async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.query.business_id;
      if (String(purchase.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    await Purchase.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
