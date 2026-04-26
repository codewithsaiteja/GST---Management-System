const router = require('express').Router();
const { Invoice, Purchase } = require('../utils/db');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

// ── PATCH /api/payments/invoice/:id — record payment on sales invoice ─────────
router.patch('/invoice/:id', auth, async (req, res) => {
  try {
    const { amount_paid, payment_method, payment_date, payment_due_date, payment_notes } = req.body;
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const paid = parseFloat(amount_paid) || 0;
    const total = parseFloat(inv.total_amount) || 0;
    const payment_status = paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';

    await Invoice.findByIdAndUpdate(req.params.id, {
      amount_paid: paid, payment_status, payment_method,
      payment_date: payment_date || null,
      payment_due_date: payment_due_date || inv.payment_due_date || null,
      payment_notes,
    });
    res.json({ success: true, message: 'Payment updated', data: { payment_status, amount_paid: paid, balance: Math.max(0, total - paid) } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── PATCH /api/payments/purchase/:id — record payment on purchase ─────────────
router.patch('/purchase/:id', auth, async (req, res) => {
  try {
    const { amount_paid, payment_method, payment_date, payment_due_date } = req.body;
    const pur = await Purchase.findById(req.params.id);
    if (!pur) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const paid = parseFloat(amount_paid) || 0;
    const total = parseFloat(pur.total_amount) || 0;
    const payment_status = paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';

    await Purchase.findByIdAndUpdate(req.params.id, {
      amount_paid: paid, payment_status, payment_method,
      payment_date: payment_date || null,
      payment_due_date: payment_due_date || pur.payment_due_date || null,
    });
    res.json({ success: true, message: 'Payment updated', data: { payment_status, amount_paid: paid, balance: Math.max(0, total - paid) } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/payments/summary — payment summary for a business ────────────────
router.get('/summary', auth, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const bid = new mongoose.Types.ObjectId(business_id);

    const [receivable] = await Invoice.aggregate([
      { $match: { business_id: bid, status: { $ne: 'cancelled' } } },
      { $group: {
        _id: null,
        total_invoiced: { $sum: '$total_amount' },
        total_received: { $sum: { $ifNull: ['$amount_paid', 0] } },
        unpaid_count:   { $sum: { $cond: [{ $eq: ['$payment_status','unpaid'] }, 1, 0] } },
        partial_count:  { $sum: { $cond: [{ $eq: ['$payment_status','partial'] }, 1, 0] } },
        paid_count:     { $sum: { $cond: [{ $eq: ['$payment_status','paid'] }, 1, 0] } },
      }}
    ]);

    const [payable] = await Purchase.aggregate([
      { $match: { business_id: bid } },
      { $group: {
        _id: null,
        total_purchased: { $sum: '$total_amount' },
        total_paid:      { $sum: { $ifNull: ['$amount_paid', 0] } },
        unpaid_count:    { $sum: { $cond: [{ $eq: ['$payment_status','unpaid'] }, 1, 0] } },
      }}
    ]);

    const r = receivable || { total_invoiced: 0, total_received: 0, unpaid_count: 0, partial_count: 0, paid_count: 0 };
    const p = payable   || { total_purchased: 0, total_paid: 0, unpaid_count: 0 };

    res.json({ success: true, data: {
      receivable: { total: r.total_invoiced, received: r.total_received, outstanding: r.total_invoiced - r.total_received, unpaid: r.unpaid_count, partial: r.partial_count, paid: r.paid_count },
      payable:    { total: p.total_purchased, paid: p.total_paid, outstanding: p.total_purchased - p.total_paid, unpaid: p.unpaid_count },
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/payments/overdue — overdue invoices ──────────────────────────────
router.get('/overdue', auth, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const today = new Date().toISOString().split('T')[0];
    const overdue = await Invoice.find({
      business_id,
      payment_status: { $in: ['unpaid','partial'] },
      payment_due_date: { $lt: today, $ne: null },
      status: { $ne: 'cancelled' },
    }).sort({ payment_due_date: 1 }).lean();
    res.json({ success: true, data: overdue });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/payments/pnl — Profit & Loss summary ────────────────────────────
router.get('/pnl', auth, async (req, res) => {
  try {
    const { business_id, from_date, to_date } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const bid = new mongoose.Types.ObjectId(business_id);

    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const from = from_date || `${fyStart}-04-01`;
    const to   = to_date   || `${fyStart + 1}-03-31`;

    // Revenue — from confirmed sales invoices
    const [revenue] = await Invoice.aggregate([
      { $match: { business_id: bid, status: { $ne: 'cancelled' }, invoice_date: { $gte: from, $lte: to } } },
      { $group: { _id: null, gross: { $sum: '$total_amount' }, taxable: { $sum: '$taxable_value' }, tax: { $sum: { $add: ['$cgst','$sgst','$igst'] } } } }
    ]);

    // Expenses — from purchases
    const [expenses] = await Purchase.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: from, $lte: to } } },
      { $group: { _id: null, gross: { $sum: '$total_amount' }, taxable: { $sum: '$taxable_value' }, tax: { $sum: { $add: ['$cgst','$sgst','$igst'] } } } }
    ]);

    // Monthly breakdown
    const monthly = await Invoice.aggregate([
      { $match: { business_id: bid, status: { $ne: 'cancelled' }, invoice_date: { $gte: from, $lte: to } } },
      { $group: { _id: { m: { $substr: ['$invoice_date',5,2] }, y: { $substr: ['$invoice_date',0,4] } }, revenue: { $sum: '$taxable_value' }, tax_collected: { $sum: { $add: ['$cgst','$sgst','$igst'] } } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } }
    ]);

    const purchaseMonthly = await Purchase.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: from, $lte: to } } },
      { $group: { _id: { m: { $substr: ['$invoice_date',5,2] }, y: { $substr: ['$invoice_date',0,4] } }, expenses: { $sum: '$taxable_value' } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } }
    ]);

    const r = revenue  || { gross: 0, taxable: 0, tax: 0 };
    const e = expenses || { gross: 0, taxable: 0, tax: 0 };
    const grossProfit  = r.taxable - e.taxable;
    const netProfit    = r.gross - e.gross;

    // Merge monthly data
    const monthMap = {};
    monthly.forEach(m => { const k = `${m._id.y}-${m._id.m}`; monthMap[k] = { ...m._id, revenue: m.revenue, tax_collected: m.tax_collected, expenses: 0 }; });
    purchaseMonthly.forEach(m => { const k = `${m._id.y}-${m._id.m}`; if (monthMap[k]) monthMap[k].expenses = m.expenses; else monthMap[k] = { ...m._id, revenue: 0, tax_collected: 0, expenses: m.expenses }; });
    const monthlyData = Object.values(monthMap).sort((a,b) => a.y !== b.y ? a.y-b.y : a.m-b.m).map(m => ({ ...m, profit: m.revenue - m.expenses }));

    res.json({ success: true, data: {
      period: { from, to },
      revenue:      { gross: r.gross, taxable: r.taxable, tax_collected: r.tax },
      expenses:     { gross: e.gross, taxable: e.taxable, tax_paid: e.tax },
      gross_profit: grossProfit,
      net_profit:   netProfit,
      profit_margin: r.taxable > 0 ? parseFloat(((grossProfit / r.taxable) * 100).toFixed(2)) : 0,
      monthly: monthlyData,
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
