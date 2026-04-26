const router = require('express').Router();
const { Purchase, Party } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');
const mongoose = require('mongoose');

function norm(doc) { if (doc && doc._id) doc.id = String(doc._id); return doc; }

router.get('/', auth, requireBizAccess, async (req, res) => {
  try {
    const { business_id, period } = req.query;
    if (!business_id || !period) return res.status(400).json({ success: false, message: 'business_id and period required' });
    const m = period.substring(0,2), y = period.substring(2);
    const from = `${y}-${m}-01`, to = `${y}-${m}-${String(new Date(parseInt(y),parseInt(m),0).getDate()).padStart(2,'0')}`;
    const purchases = await Purchase.find({ business_id, invoice_date: { $gte: from, $lte: to } }).lean();
    for (const p of purchases) {
      norm(p);
      if (p.party_id) { const party = await Party.findById(p.party_id).select('name').lean(); p.vendor = party?.name; }
    }
    const matched = purchases.filter(p=>p.match_status==='matched').length;
    const mismatched = purchases.filter(p=>p.match_status==='mismatch').length;
    const pending = purchases.filter(p=>p.match_status==='pending');
    const totalITC = purchases.filter(p=>p.itc_eligible).reduce((s,p)=>s+(p.cgst+p.sgst+p.igst),0);
    res.json({ success: true, data: { purchases, matched, mismatched, pending: pending.length, total_itc_eligible: parseFloat(totalITC.toFixed(2)), mismatched_invoices: purchases.filter(p=>p.match_status==='mismatch'), pending_invoices: pending } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/match', auth, requireBizAccess, async (req, res) => {
  try {
    const { ids, status, business_id } = req.body;
    
    // Validate inputs
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required and cannot be empty' });
    }
    
    if (!['pending', 'matched', 'mismatch'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be pending, matched, or mismatch' });
    }
    
    const bizId = business_id || req.query.business_id;
    if (!bizId) {
      return res.status(400).json({ success: false, message: 'business_id is required' });
    }
    
    // Convert string IDs to ObjectIds
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
    
    // Update with business_id filter for security
    const result = await Purchase.updateMany(
      { 
        _id: { $in: objectIds }, 
        business_id: bizId 
      }, 
      { 
        match_status: status, 
        gstr2b_matched: status === 'matched' ? 1 : 0,
        updated_at: new Date()
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'No matching purchases found for this business' });
    }
    
    res.json({ success: true, message: `${result.modifiedCount} invoices updated to ${status}` });
  } catch(e) { 
    console.error('Reconcile match error:', e);
    res.status(500).json({ success: false, message: e.message }); 
  }
});

module.exports = router;
