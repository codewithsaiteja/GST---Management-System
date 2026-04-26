const router = require('express').Router();
const { Return, Invoice, Purchase } = require('../utils/db');
const { auth, requireRole, requireBizAccess } = require('../middleware/auth');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, return_type, period } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (return_type) filter.return_type = return_type;
    if (period) filter.period = period;
    const data = await Return.find(filter).sort({ period: -1 }).lean();
    data.forEach(norm);
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/prepare', auth, requireRole('admin','accountant'), requireBizAccess, async (req, res) => {
  try {
    const { business_id, return_type, period } = req.body;
    if (!business_id || !return_type || !period) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const m = period.substring(0,2), y = period.substring(2);
    const fromDate = `${y}-${m}-01`;
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    const toDate = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
    let data = {}, totals = {};

    if (return_type === 'GSTR1') {
      const sales = await Invoice.find({ business_id, invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' }).lean();
      totals = sales.reduce((a,i) => ({ taxable: a.taxable+i.taxable_value, cgst: a.cgst+i.cgst, sgst: a.sgst+i.sgst, igst: a.igst+i.igst, cess: a.cess+i.cess }), { taxable:0,cgst:0,sgst:0,igst:0,cess:0 });
      data = { b2b_invoices: sales.filter(i=>i.invoice_type==='B2B').length, b2c_invoices: sales.filter(i=>i.invoice_type==='B2C').length, total_invoices: sales.length, totals };
    } else if (return_type === 'GSTR3B') {
      const salesAgg = await Invoice.aggregate([{ $match: { business_id: require('mongoose').Types.ObjectId.createFromHexString(business_id), invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' } }, { $group: { _id: null, tv: { $sum: '$taxable_value' }, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' } } }]);
      const purchAgg = await Purchase.aggregate([{ $match: { business_id: require('mongoose').Types.ObjectId.createFromHexString(business_id), invoice_date: { $gte: fromDate, $lte: toDate }, itc_eligible: 1 } }, { $group: { _id: null, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' } } }]);
      const s = salesAgg[0] || {}; const p = purchAgg[0] || {};
      const totalTax = (s.cgst||0)+(s.sgst||0)+(s.igst||0);
      const totalITC = (p.cgst||0)+(p.sgst||0)+(p.igst||0);
      totals = { taxable: s.tv||0, cgst: s.cgst||0, sgst: s.sgst||0, igst: s.igst||0, cess: 0 };
      data = { outward_supplies: s, itc_available: p, net_payable: Math.max(0,totalTax-totalITC), itc_claimed: totalITC };
    }

    const summary = { total_taxable: totals.taxable||0, total_cgst: totals.cgst||0, total_sgst: totals.sgst||0, total_igst: totals.igst||0, total_cess: totals.cess||0, itc_claimed: data.itc_claimed||0, net_liability: data.net_payable||0 };
    const ret = await Return.findOneAndUpdate(
      { business_id, return_type, period },
      { ...summary, status: 'prepared', json_data: JSON.stringify(data), created_by: req.user._id },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: { id: String(ret._id), ...summary, details: data }, message: 'Return prepared successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/file', auth, requireRole('admin','accountant'), async (req, res) => {
  const arn = `AA${Date.now()}`;
  await Return.findByIdAndUpdate(req.params.id, { status: 'filed', arn, filed_at: new Date() });
  res.json({ success: true, message: 'Return filed', data: { arn } });
});

module.exports = router;
