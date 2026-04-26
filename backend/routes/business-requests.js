const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const BusinessRequest = require('../models/BusinessRequest');
const { User, Business, UserBusiness } = require('../utils/db');

// Sanitize input to prevent NoSQL injection
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.replace(/[<>]/g, ''); // Remove potential HTML/script tags
  }
  return input;
};

const validate = (validations) => {
  return async (req, res, next) => {
    for (let validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({ 
      success: false, 
      message: errors.array()[0].msg, 
      errors: errors.array() 
    });
  };
};

// ── Create Business Access Request ───────────────────────────────────────────
router.post('/request', 
  auth, 
  validate([
    body('business_name').trim().notEmpty().withMessage('Business name is required'),
    body('gstin').optional().trim(),
    body('message').optional().trim()
  ]),
  async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User authentication failed' });
    }

    const { business_name, gstin, message } = req.body;
    
    // Check if user already has a pending request
    const existingRequest = await BusinessRequest.findOne({
      user_id: req.user._id,
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a pending business access request',
        request: existingRequest
      });
    }
    
    // Create new request
    const request = await BusinessRequest.create({
      user_id: req.user._id,
      user_name: req.user.name || 'Unknown',
      user_email: req.user.email || 'Unknown',
      business_name,
      gstin: gstin || '',
      message: message || ''
    });
    
    // Notify admins via system (could integrate with chat/notification system)
    console.log(`📬 New business access request from ${req.user.name} (${req.user.email})`);
    console.log(`   Business: ${business_name}${gstin ? ` (${gstin})` : ''}`);
    
    // Notify admins via Socket.IO
    const io = req.app?.get('io');
    if (io) {
      io.to('admin_watch').emit('businessRequestCreated', {
        requestId: request._id,
        userId: request.user_id,
        userName: request.user_name,
        userEmail: request.user_email,
        businessName: request.business_name,
        gstin: request.gstin,
        message: request.message,
        createdAt: request.created_at
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Business access request submitted successfully. An admin will review it shortly.',
      request: {
        id: request._id,
        business_name: request.business_name,
        status: request.status,
        created_at: request.created_at
      }
    });
  } catch(e) { 
    console.error('Business Request Error:', e);
    res.status(500).json({ success: false, message: 'Internal server error while processing request: ' + e.message }); 
  }
});

// ── Get User's Requests ───────────────────────────────────────────────────────
router.get('/my-requests', auth, async (req, res) => {
  try {
    const requests = await BusinessRequest.find({ user_id: req.user._id })
      .sort({ created_at: -1 })
      .lean();
    
    res.json({ success: true, data: requests });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// ── Get Pending Request Status ────────────────────────────────────────────────
router.get('/pending-status', auth, async (req, res) => {
  try {
    const pendingRequest = await BusinessRequest.findOne({
      user_id: req.user._id,
      status: 'pending'
    }).lean();
    
    res.json({ 
      success: true, 
      hasPending: !!pendingRequest,
      request: pendingRequest || null
    });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// ── Admin: Get All Requests ───────────────────────────────────────────────────
router.get('/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const { status } = req.query;
    const filter = status ? { status } : {};
    
    const requests = await BusinessRequest.find(filter)
      .sort({ created_at: -1 })
      .lean();
    
    res.json({ success: true, data: requests });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// ── Admin: Approve Request ────────────────────────────────────────────────────
router.post('/approve/:id', 
  auth,
  validate([
    body('business_id').notEmpty().withMessage('Business ID is required'),
    body('admin_notes').optional().trim()
  ]),
  async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const { business_id, admin_notes } = req.body;
    const requestId = req.params.id;
    
    // Find the request
    const request = await BusinessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request has already been processed' });
    }
    
    // Verify business exists
    const business = await Business.findById(business_id);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }
    
    // Check if user already has access to this business
    const existingAccess = await UserBusiness.findOne({
      user_id: request.user_id,
      business_id: business_id
    });
    
    if (existingAccess) {
      // Update request status but don't create duplicate access
      request.status = 'approved';
      request.admin_notes = admin_notes || 'User already has access to this business';
      request.processed_by = req.user._id;
      request.processed_at = new Date();
      await request.save();
      
      return res.json({ 
        success: true, 
        message: 'Request approved (user already had access)',
        request 
      });
    }
    
    // Assign business to user
    await UserBusiness.create({
      user_id: request.user_id,
      business_id: business_id,
      assigned_by: req.user._id,
      assigned_at: new Date()
    });
    
    // Update request status
    request.status = 'approved';
    request.admin_notes = admin_notes || '';
    request.processed_by = req.user._id;
    request.processed_at = new Date();
    await request.save();
    
    console.log(`✅ Business access approved: ${request.user_name} → ${business.trade_name || business.legal_name}`);
    
    res.json({ 
      success: true, 
      message: 'Business access request approved successfully',
      request 
    });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// ── Admin: Reject Request ─────────────────────────────────────────────────────
router.post('/reject/:id', 
  auth,
  validate([
    body('admin_notes').optional().trim()
  ]),
  async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const { admin_notes } = req.body;
    const requestId = req.params.id;
    
    const request = await BusinessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request has already been processed' });
    }
    
    request.status = 'rejected';
    request.admin_notes = admin_notes || '';
    request.processed_by = req.user._id;
    request.processed_at = new Date();
    await request.save();
    
    console.log(`❌ Business access rejected: ${request.user_name}`);
    
    res.json({ 
      success: true, 
      message: 'Business access request rejected',
      request 
    });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// ── Admin: Get Request Statistics ─────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const [pending, approved, rejected, total] = await Promise.all([
      BusinessRequest.countDocuments({ status: 'pending' }),
      BusinessRequest.countDocuments({ status: 'approved' }),
      BusinessRequest.countDocuments({ status: 'rejected' }),
      BusinessRequest.countDocuments({})
    ]);
    
    res.json({ 
      success: true, 
      data: { pending, approved, rejected, total }
    });
  } catch(e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

module.exports = router;
