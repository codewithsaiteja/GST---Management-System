const router = require('express').Router();
const { Invoice, Purchase, Compliance } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');
const mongoose = require('mongoose');

function toObjId(id) { return new mongoose.Types.ObjectId(id); }

router.get('/dashboard', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const bid = toObjId(business_id);
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1;
    const fy = `${fyStart}-${fyStart+1}`;
    const fromDate = `${fyStart}-04-01`, toDate = `${fyStart+1}-03-31`;

    const [summaryAgg] = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' } },
      { $group: { _id: null, total_invoices: { $sum: 1 }, total_sales: { $sum: { $ifNull: ['$total_amount', 0] } }, total_taxable: { $sum: { $ifNull: ['$taxable_value', 0] } }, total_tax: { $sum: { $add: [{ $ifNull: ['$cgst', 0] }, { $ifNull: ['$sgst', 0] }, { $ifNull: ['$igst', 0] }] } }, total_cess: { $sum: { $ifNull: ['$cess', 0] } } } }
    ]);
    const [itcAgg] = await Purchase.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fromDate, $lte: toDate }, itc_eligible: 1 } },
      { $group: { _id: null, itc_eligible: { $sum: { $add: ['$cgst','$sgst','$igst'] } } } }
    ]);
    const monthly = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' } },
      { $group: { _id: { m: { $substr: ['$invoice_date',5,2] }, y: { $substr: ['$invoice_date',0,4] } }, taxable: { $sum: { $ifNull: ['$taxable_value', 0] } }, tax: { $sum: { $add: [{ $ifNull: ['$cgst', 0] }, { $ifNull: ['$sgst', 0] }, { $ifNull: ['$igst', 0] }] } }, count: { $sum: 1 } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
      { $project: { _id: 0, m: '$_id.m', y: '$_id.y', taxable: 1, tax: 1, count: 1 } }
    ]);
    const topCustomers = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' } },
      { $group: { _id: '$party_name', total: { $sum: { $ifNull: ['$total_amount', 0] } }, invoices: { $sum: 1 } } },
      { $sort: { total: -1 } }, { $limit: 10 },
      { $project: { _id: 0, party_name: '$_id', total: 1, invoices: 1 } }
    ]);
    const bySupplyType = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fromDate, $lte: toDate }, status: 'confirmed' } },
      { $group: { _id: '$supply_type', taxable: { $sum: { $ifNull: ['$taxable_value', 0] } }, cgst: { $sum: { $ifNull: ['$cgst', 0] } }, sgst: { $sum: { $ifNull: ['$sgst', 0] } }, igst: { $sum: { $ifNull: ['$igst', 0] } } } },
      { $project: { _id: 0, supply_type: '$_id', taxable: 1, cgst: 1, sgst: 1, igst: 1 } }
    ]);
    const sevenDays = new Date(Date.now()+7*24*60*60*1000).toISOString().split('T')[0];
    const pendingComp = await Compliance.countDocuments({ business_id: bid, status: 'pending', due_date: { $lte: sevenDays } });
    const overdueComp = await Compliance.countDocuments({ business_id: bid, status: 'overdue' });

    const summary = summaryAgg || { total_invoices:0, total_sales:0, total_taxable:0, total_tax:0, total_cess:0 };
    const itc = itcAgg?.itc_eligible || 0;
    res.json({ success: true, data: {
      summary: { ...summary, itc_eligible: itc, net_liability: Math.max(0,(summary.total_tax||0)-itc), financial_year: fy },
      monthly, top_customers: topCustomers, by_supply_type: bySupplyType,
      compliance: { pending_upcoming: pendingComp, overdue: overdueComp }
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/tax-trend', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, months = 12 } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const bid = toObjId(business_id);
    const since = new Date(); since.setMonth(since.getMonth() - parseInt(months));
    const sinceStr = since.toISOString().split('T')[0];
    const rows = await Invoice.aggregate([
      { $match: { business_id: bid, status: 'confirmed', invoice_date: { $gte: sinceStr } } },
      { $group: { _id: { m: { $substr: ['$invoice_date',5,2] }, y: { $substr: ['$invoice_date',0,4] } }, cgst: { $sum: { $ifNull: ['$cgst', 0] } }, sgst: { $sum: { $ifNull: ['$sgst', 0] } }, igst: { $sum: { $ifNull: ['$igst', 0] } }, taxable: { $sum: { $ifNull: ['$taxable_value', 0] } } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
      { $project: { _id: 0, period: { $concat: ['$_id.m','/',' $_id.y'] }, cgst: 1, sgst: 1, igst: 1, taxable: 1 } }
    ]);
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/itc-summary', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const [r] = await Purchase.aggregate([
      { $match: { business_id: toObjId(business_id), itc_eligible: 1 } },
      { $group: { _id: null, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' }, cess: { $sum: '$cess' }, bills: { $sum: 1 } } },
      { $project: { _id: 0 } }
    ]);
    res.json({ success: true, data: r || { cgst:0, sgst:0, igst:0, cess:0, bills:0 } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
