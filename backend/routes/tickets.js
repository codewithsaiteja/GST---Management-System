const express = require('express');
const router  = express.Router();
const Ticket  = require('../models/Ticket');
const { auth } = require('../middleware/auth');

/* ── POST /api/tickets/contact — Public contact form (no auth) ──── */
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, description } = req.body;
    
    if (!name || !email || !subject || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format.' 
      });
    }

    const ticket = await Ticket.create({
      userId:      'guest_' + Date.now(),
      userName:    name.trim().substring(0, 100),
      userEmail:   email.trim().toLowerCase(),
      subject:     subject.trim().substring(0, 200),
      description: description.trim().substring(0, 4000),
      priority:    'medium',
      chatRoom:    '',
      status:      'open',
    });

    // Notify admin panel via Socket.IO
    const io = req.app?.get('io');
    if (io) {
      io.to('admin_watch').emit('ticketCreated', {
        ticketId:   ticket.ticketId,
        userId:     ticket.userId,
        userName:   ticket.userName,
        userEmail:  ticket.userEmail,
        subject:    ticket.subject,
        priority:   ticket.priority,
        status:     ticket.status,
        createdAt:  ticket.createdAt,
      });
    }

    console.log(`📧 Contact form ticket created: ${ticket.ticketId} from ${email}`);

    res.status(201).json({ 
      success: true, 
      message: 'Your message has been received. We will contact you soon.',
      ticketId: ticket.ticketId
    });
  } catch (e) {
    console.error('Contact form error:', e.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit your message. Please try again later.' 
    });
  }
});

/* ── POST /api/tickets — User creates a ticket ─────────────────── */
router.post('/', auth, async (req, res) => {
  try {
    const { subject, description, priority, chatRoom } = req.body;
    if (!subject || !description)
      return res.status(400).json({ success: false, message: 'Subject and description are required.' });

    const ticket = await Ticket.create({
      userId:      String(req.user._id || req.user.id),
      userName:    req.user.name  || req.user.email || 'User',
      userEmail:   req.user.email || '',
      subject:     subject.trim().substring(0, 200),
      description: description.trim().substring(0, 4000),
      priority:    priority || 'medium',
      chatRoom:    chatRoom || `chat_${req.user._id || req.user.id}`,
      status:      'open',
    });

    // Notify admin panel via Socket.IO in real time
    const io = req.app.get('io');
    if (io) {
      io.to('admin_watch').emit('ticketCreated', {
        ticketId:   ticket.ticketId,
        userId:     ticket.userId,
        userName:   ticket.userName,
        userEmail:  ticket.userEmail,
        subject:    ticket.subject,
        priority:   ticket.priority,
        status:     ticket.status,
        chatRoom:   ticket.chatRoom,
        createdAt:  ticket.createdAt,
      });
    }

    res.status(201).json({ success: true, data: ticket });
  } catch (e) {
    console.error('Ticket create error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── GET /api/tickets — Admin gets all tickets ─────────────────── */
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const filter = {};
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;

    const tickets = await Ticket.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: tickets });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── GET /api/tickets/my — User sees their own tickets ─────────── */
router.get('/my', auth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const tickets = await Ticket.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: tickets });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── GET /api/tickets/:id — Single ticket ──────────────────────── */
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.id }).lean();
    if (!ticket)
      return res.status(404).json({ success: false, message: 'Ticket not found' });

    const userId = String(req.user._id || req.user.id);
    if (req.user.role !== 'admin' && ticket.userId !== userId)
      return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── PATCH /api/tickets/:id/status — Admin updates status ──────── */
router.patch('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { status, priority } = req.body;
    const update = {};
    if (status)   update.status   = status;
    if (priority) update.priority = priority;

    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.id },
      update,
      { new: true }
    ).lean();

    if (!ticket)
      return res.status(404).json({ success: false, message: 'Ticket not found' });

    res.json({ success: true, data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── POST /api/tickets/:id/reply — Admin adds a reply ──────────── */
router.post('/:id/reply', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { message } = req.body;
    if (!message)
      return res.status(400).json({ success: false, message: 'Message required' });

    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: req.params.id },
      {
        $push: {
          replies: {
            sender:     'admin',
            senderName: req.user.name || 'Admin',
            message:    message.trim().substring(0, 2000),
            createdAt:  new Date(),
          },
        },
        $set: { status: 'in_progress' },
      },
      { new: true }
    ).lean();

    if (!ticket)
      return res.status(404).json({ success: false, message: 'Ticket not found' });

    res.json({ success: true, data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
