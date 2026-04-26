const router = require('express').Router();
const { Invoice, InvoiceItem, Business, Party } = require('../utils/db');
const { auth, requireRole, requireBizAccess, auditLog } = require('../middleware/auth');
const { calcInvoiceTotals, generateIRN, getFinancialYear } = require('../utils/gst');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map(e => e.msg).join(', ');
    return res.status(400).json({ success: false, message });
  }
  next();
};

// Normalize _id → id string on a lean document
function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, status, from_date, to_date, invoice_type, search, page = 1, limit = 30 } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (status) filter.status = status;
    if (from_date || to_date) { filter.invoice_date = {}; if (from_date) filter.invoice_date.$gte = from_date; if (to_date) filter.invoice_date.$lte = to_date; }
    if (invoice_type) filter.invoice_type = invoice_type;
    // BUG-07: wire up search filter
    if (search) filter.$or = [
      { party_name: { $regex: search, $options: 'i' } },
      { invoice_number: { $regex: search, $options: 'i' } },
    ];
    const total = await Invoice.countDocuments(filter);
    const rows = await Invoice.find(filter).sort({ invoice_date: -1, _id: -1 }).skip((page-1)*limit).limit(parseInt(limit)).lean();
    for (const r of rows) {
      norm(r);
      if (r.party_id) { const p = await Party.findById(r.party_id).select('name').lean(); r.party_name_resolved = p?.name; }
    }
    res.json({ success: true, data: rows, total, page: parseInt(page), pages: Math.ceil(total/limit) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireRole('admin','accountant'), requireBizAccess, auditLog('CREATE_INVOICE','invoice'), [
  body('business_id').notEmpty(), body('invoice_number').trim().notEmpty(),
  body('invoice_date').isISO8601(), body('items').isArray({ min: 1 }), validate
], async (req, res) => {
  try {
    const { business_id, invoice_number, invoice_date, invoice_type, supply_type, party_id, party_name, party_gstin, party_state_code, place_of_supply, reverse_charge, items, notes, tds_amount, tcs_amount } = req.body;
    const business = await Business.findById(business_id);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found' });
    const totals = calcInvoiceTotals(items, supply_type, business.state_code, party_state_code);
    const inv = await Invoice.create({ business_id, invoice_number, invoice_date, invoice_type: invoice_type||'B2B', supply_type: supply_type||'intra', party_id: party_id||null, party_name, party_gstin, party_state_code, place_of_supply: place_of_supply||party_state_code, reverse_charge: reverse_charge?1:0, ...totals, tds_amount: tds_amount||0, tcs_amount: tcs_amount||0, notes, status: 'draft', created_by: req.user._id });
    await InvoiceItem.insertMany(items.map(item => ({ invoice_id: inv._id, ...item })));
    res.json({ success: true, data: { id: String(inv._id), ...totals }, message: 'Invoice created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', auth, requireBizAccess, async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.query.business_id || inv.business_id;
      if (String(inv.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    norm(inv);
    const items = await InvoiceItem.find({ invoice_id: req.params.id }).lean();
    items.forEach(norm);
    if (inv.party_id) { const p = await Party.findById(inv.party_id).select('name').lean(); inv.party_resolved = p?.name; }
    res.json({ success: true, data: { ...inv, items } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, requireRole('admin','accountant'), requireBizAccess, async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (inv.status === 'cancelled') return res.status(400).json({ success: false, message: 'Cannot edit cancelled invoice' });
    if (inv.status === 'confirmed') return res.status(400).json({ success: false, message: 'Cannot edit confirmed invoice' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.body.business_id || req.query.business_id;
      if (String(inv.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    const { invoice_date, party_id, party_name, party_gstin, party_state_code, place_of_supply, items, notes, tds_amount, tcs_amount, supply_type } = req.body;
    const business = await Business.findById(inv.business_id);
    const totals = calcInvoiceTotals(items || [], supply_type || inv.supply_type, business.state_code, party_state_code || inv.party_state_code);
    await Invoice.findByIdAndUpdate(req.params.id, { invoice_date: invoice_date||inv.invoice_date, party_id: party_id||inv.party_id, party_name: party_name||inv.party_name, party_gstin: party_gstin||inv.party_gstin, party_state_code: party_state_code||inv.party_state_code, place_of_supply: place_of_supply||inv.place_of_supply, ...totals, tds_amount: tds_amount??inv.tds_amount, tcs_amount: tcs_amount??inv.tcs_amount, notes: notes??inv.notes });
    if (items) {
      await InvoiceItem.deleteMany({ invoice_id: req.params.id });
      await InvoiceItem.insertMany(items.map(item => ({ invoice_id: inv._id, ...item })));
    }
    res.json({ success: true, message: 'Invoice updated', data: totals });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/confirm', auth, requireRole('admin','accountant'), requireBizAccess, async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (inv.status !== 'draft') return res.status(400).json({ success: false, message: 'Only draft invoices can be confirmed' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.body.business_id || req.query.business_id;
      if (String(inv.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    const business = await Business.findById(inv.business_id);
    const irn = generateIRN(business.gstin, inv.invoice_number, getFinancialYear(inv.invoice_date));
    await Invoice.findByIdAndUpdate(req.params.id, { status: 'confirmed', irn, ack_no: `ACK${Date.now()}`, ack_date: new Date() });
    res.json({ success: true, message: 'Invoice confirmed', data: { irn } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/cancel', auth, requireRole('admin','accountant'), async (req, res) => {
  await Invoice.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
  res.json({ success: true, message: 'Invoice cancelled' });
});

router.delete('/:id', auth, requireRole('admin','accountant'), requireBizAccess, async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (inv.status === 'confirmed') return res.status(400).json({ success: false, message: 'Cannot delete confirmed invoice. Cancel first.' });
    
    // Check business access for non-admins
    if (req.user.role !== 'admin') {
      const bizId = req.query.business_id;
      if (String(inv.business_id) !== String(bizId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    await InvoiceItem.deleteMany({ invoice_id: req.params.id });
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
