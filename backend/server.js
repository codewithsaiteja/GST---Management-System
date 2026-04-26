require('dotenv').config();
const validateEnv = require('./utils/validateEnv');
validateEnv(); // crash early if required env vars are missing

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression= require('compression');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { initDb } = require('./utils/db');
const Chat       = require('./models/Chat');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const logger     = require('./utils/logger');
const swaggerUi  = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');
const { generateGstResponse } = require('./utils/ai');

const app    = express();
const server = http.createServer(app);
const SECRET = process.env.JWT_SECRET || 'gst_secret';

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

/* ── Middleware ─────────────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }));

// Permissive CORS for production - handles preflight and allows the frontend origin
app.use(cors({
  origin: true, // Reflects the request origin, helpful for multi-origin setups
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.options('*', cors()); // handle preflight

app.use(compression());

// Debug logger for all incoming requests (crucial for production debugging)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Route morgan through winston
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 1000, standardHeaders: true, legacyHeaders: false }));

// Serve static assets but disable auto-serving index.html for '/'
app.use(express.static(path.join(__dirname, '../'), { index: false }));
app.use(express.static(path.join(__dirname, '../frontend'), { index: false }));
app.use(express.static(path.join(__dirname, '../frontend/html'), { index: false }));

// Swagger API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'GST API Docs' }));

/* ── Routes ─────────────────────────────────────────────────── */
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/business-requests', require('./routes/business-requests'));
app.use('/api/parties',    require('./routes/parties'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/purchases',  require('./routes/purchases'));
app.use('/api/returns',    require('./routes/returns'));
app.use('/api/reconcile',  require('./routes/reconcile'));
app.use('/api/hsn',        require('./routes/hsn'));
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/tds',        require('./routes/tds'));
app.use('/api/export',     require('./routes/export'));
app.use('/api/audit',      require('./routes/audit'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/tickets',    require('./routes/tickets'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/chat',       require('./routes/chat'));

const { auth } = require('./middleware/auth');

/* ── Chat REST ──────────────────────────────────────────────── */
// GET /api/chat/rooms  — admin: all rooms with last message
app.get('/api/chat/rooms', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    const rooms = await Chat.aggregate([
      { $sort: { created_at: -1 } },
      { $group: { _id: '$room', lastMessage: { $first: '$message' }, lastTime: { $first: '$created_at' }, senderName: { $first: '$senderName' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$role','user'] }, { $eq: ['$read',false] }] }, 1, 0] } } } },
      { $sort: { lastTime: -1 } },
    ]);
    res.json({ success: true, data: rooms });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/chat/:room  — history
app.get('/api/chat/:room', auth, async (req, res) => {
  try {
    const room = req.params.room;
    const isOwner = room === `chat_${req.user._id}`;
    if (req.user.role !== 'admin' && !isOwner) return res.status(403).json({ success: false, message: 'Access denied' });
    const msgs = await Chat.find({ room }).sort({ created_at: 1 }).limit(200).lean();
    if (req.user.role === 'admin') await Chat.updateMany({ room, role: 'user', read: false }, { read: true }).catch(() => {});
    res.json({ success: true, data: msgs });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/backup', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  res.json({ success: true, message: 'Use mongodump. URI: ' + (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gst_system') });
});

app.set('io', io);

// Landing page is the entry point
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/landing.html'));
});

// Serve login/app page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

// Serve app page
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

// Serve static pages
app.get('/landing.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/landing.html'));
});

app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/contact.html'));
});

app.get('/privacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/privacy.html'));
});

app.get('/terms.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/terms.html'));
});

app.get('/support.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/support.html'));
});

app.get('/documentation.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/html/documentation.html'));
});

// Catch-all for other routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/html/landing.html'));
  }
});

app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method}`);
  res.status(err.status||500).json({ success: false, message: err.message||'Internal server error' });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const online    = new Map(); // socketId → { userId, userName, role, room, activeRoom }
const botFails  = new Map(); // room → { count, warned }
const msgRates  = new Map(); // socketId → { count, resetAt }
const botTimers = new Map(); // room → timeoutId

const MSG_MAX_LEN = 2000;
const RATE_LIMIT  = 20;    // max messages per 10s
const RATE_WINDOW = 10000;

const BOT_REPLIES = [
  { keywords: ['invoice','bill'],                           message: 'To manage invoices, go to the "Sales Invoices" tab. 📄' },
  { keywords: ['return','gstr'],                            message: 'GST returns (GSTR-1, GSTR-3B) are under the "GST Returns" tab. 📊' },
  { keywords: ['hsn','sac'],                                message: 'Search HSN/SAC codes using the "HSN Lookup" tool in the sidebar. 🔍' },
  { keywords: ['password','login','account'],               message: 'To reset your password, go to Settings or contact the admin. 🔐' },
  { keywords: ['compliance','deadline','due','overdue'],    message: 'Open the "Compliance" tab to see all upcoming and overdue GST deadlines. 📅' },
  { keywords: ['purchase','expense'],                       message: 'Track all purchases under the "Purchases" section. 🧾' },
  { keywords: ['tds'],                                      message: 'Manage TDS entries from the "TDS" module in the sidebar. 💰' },
  { keywords: ['export','download','pdf','excel','report'], message: 'Use the Export feature to download reports as PDF or Excel. 📥' },
  { keywords: ['party','supplier','customer','vendor'],     message: 'Manage all parties under the "Parties" section. 👥' },
  { keywords: ['reconcil'],                                 message: 'Reconcile purchase data with GSTR-2A/2B under the "Reconciliation" tab. ✔' },
  { keywords: ['hello','hi','hey'],                         message: 'Hello! I am the GST Support Bot 🤖. I can help with invoices, returns, HSN codes, compliance, and more.' },
  { keywords: ['thank','ok','okay','got it'],               message: "You're welcome! Anything else I can help with? 😊" },
];

// Legacy fallback function (now handled by AI utility)
function botReply(userMessage) {
  console.warn('Using legacy botReply - should use generateGstResponse instead');
  const msg = (userMessage || '').toLowerCase();
  for (const { keywords, message } of BOT_REPLIES) {
    if (keywords.some(k => msg.includes(k))) return { resolved: true, message };
  }
  return { resolved: false, message: "I couldn't fully understand your query. Please describe differently, or I can raise a support ticket for you." };
}

function broadcastOnlineUsers() {
  const users = [];
  online.forEach((d, sid) => { if (d.role !== 'admin') users.push({ socketId: sid, userId: d.userId, userName: d.userName, room: d.room }); });
  io.to('admin_watch').emit('onlineUsers', users);
}

function adminWatchingRoom(room) {
  for (const d of online.values()) { if (d.role === 'admin' && d.activeRoom === room) return true; }
  return false;
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const r = msgRates.get(socketId) || { count: 0, resetAt: now + RATE_WINDOW };
  if (now > r.resetAt) { r.count = 0; r.resetAt = now + RATE_WINDOW; }
  r.count++;
  msgRates.set(socketId, r);
  return r.count <= RATE_LIMIT;
}

io.on('connection', socket => {

  socket.on('authenticate', data => {
    try {
      if (!data?.token) throw new Error('No token');
      const decoded  = jwt.verify(data.token, SECRET);
      const userId   = String(decoded.id || decoded._id || '');
      const userName = (data.userName || 'User').substring(0, 60);
      const role     = decoded.role || 'user'; // from JWT only, never trust client
      online.set(socket.id, { userId, userName, role, room: null, activeRoom: null });
      if (role === 'admin') {
        socket.join('admin_watch');
        console.log(`👮 Admin ${userName} joined admin_watch room`);
        socket.emit('authenticated', { ok: true, role: 'admin' });
        Chat.aggregate([
          { $sort: { created_at: -1 } },
          { $group: { _id: '$room', lastMessage: { $first: '$message' }, lastTime: { $first: '$created_at' }, senderName: { $first: '$senderName' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$role','user'] }, { $eq: ['$read',false] }] }, 1, 0] } } } },
          { $sort: { lastTime: -1 } },
        ]).then(rooms => socket.emit('roomList', rooms)).catch(() => {});
      } else {
        const room = `chat_${userId}`;
        online.get(socket.id).room = room;
        socket.join(room);

        socket.emit('authenticated', { ok: true, role: 'user', room });
        broadcastOnlineUsers();
      }
    } catch(e) { socket.emit('authenticated', { ok: false, error: 'Invalid token' }); }
  });

  socket.on('joinRoom', room => {
    const d = online.get(socket.id);
    if (!d || d.role !== 'admin') return; // only admins can join arbitrary rooms
    if (d.activeRoom) socket.leave(d.activeRoom);
    d.activeRoom = room;
    socket.join(room);
  });

  socket.on('leaveRoom', room => {
    const d = online.get(socket.id);
    if (d && d.activeRoom === room) { d.activeRoom = null; socket.leave(room); }
  });

  socket.on('sendMessage', async data => {
    const d = online.get(socket.id);
    if (!d) return;

    // Rate limit check
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many messages. Please slow down.' });
      return;
    }

    // Validate and sanitize
    const rawMsg = String(data?.message || '').trim();
    if (!data?.room || !rawMsg) return;
    const message = rawMsg.substring(0, MSG_MAX_LEN);

    // Role from server state only — never from client data
    const role = d.role;

    // Users can only send to their own room
    if (role !== 'admin' && data.room !== d.room) return;

    const payload = {
      room: data.room, sender: d.userId, senderName: d.userName,
      role, userId: d.userId, message, read: false,
      created_at: new Date().toISOString(),
    };

    try {
      const saved = await Chat.create(payload);
      payload._id = String(saved._id);
    } catch(e) {
      console.error('Chat save error:', e.message);
      socket.emit('error', { message: 'Failed to send message. Please try again.' });
      return;
    }

    io.to(data.room).emit('receiveMessage', payload);
    console.log(`💬 Message sent to room ${data.room} by ${d.userName} (${role})`);

    if (role !== 'admin') {
      console.log(`📨 User message detected, notifying admin_watch...`);
      io.to('admin_watch').emit('newUserMessage', { room: data.room, userId: d.userId, senderName: d.userName, lastMessage: message, lastTime: payload.created_at });
      console.log(`✅ newUserMessage emitted to admin_watch`);

      // Cancel any pending bot reply (user sent another message)
      if (botTimers.has(data.room)) {
        clearTimeout(botTimers.get(data.room));
        botTimers.delete(data.room);
      }

      if (!adminWatchingRoom(data.room)) {
        const timer = setTimeout(async () => {
          botTimers.delete(data.room);
          
          // Get chat history for AI context
          const recentMessages = await Chat.find({ room: data.room })
            .sort({ created_at: -1 })
            .limit(10)
            .lean();
          
          const chatHistory = recentMessages.reverse().map(msg => ({
            role: msg.role === 'admin' ? 'admin' : 'user',
            message: msg.message
          }));
          
          // Use AI-powered response
          const aiResponse = await generateGstResponse(message, chatHistory);
          
          if (!aiResponse.resolved) {
            const fail = botFails.get(data.room) || { count: 0, warned: false };
            fail.count++;
            botFails.set(data.room, fail);
          } else {
            botFails.delete(data.room);
          }

          const fail = botFails.get(data.room) || { count: 0 };
          const shouldPromptTicket = !aiResponse.resolved && fail.count >= 2;

          const botMsg = {
            room: data.room, sender: 'bot', senderName: 'GST Support Bot 🤖',
            role: 'admin', userId: 'bot',
            message: shouldPromptTicket ? "I've tried my best but couldn't resolve your query. No admin is online. Would you like to raise a support ticket?" : aiResponse.message,
            type: shouldPromptTicket ? 'ticket_prompt' : 'text',
            read: true, created_at: new Date().toISOString(),
          };

          if (shouldPromptTicket) {
            botFails.set(data.room, { count: 0, warned: true });
          }

          try { await Chat.create(botMsg); } catch(e) {}
          io.to(data.room).emit('receiveMessage', botMsg);
          io.to('admin_watch').emit('newUserMessage', {
            room:       data.room,
            senderName: botMsg.senderName,
            lastMessage:botMsg.message,
            lastTime:   botMsg.created_at,
          });
        }, 1500);
        botTimers.set(data.room, timer);
      }
    }

    console.log(`💬 [${data.room}] ${payload.senderName}: ${payload.message.substring(0,60)}`);
  });

  socket.on('typing', data => {
    const d = online.get(socket.id);
    if (!d || !data?.room) return;
    if (d.role !== 'admin' && data.room !== d.room) return;
    socket.to(data.room).emit('typing', { room: data.room, sender: d.userName });
  });

  socket.on('stopTyping', data => {
    const d = online.get(socket.id);
    if (!d || !data?.room) return;
    socket.to(data.room).emit('stopTyping', { room: data.room });
  });

  socket.on('markRead', async room => {
    const d = online.get(socket.id);
    if (!d || d.role !== 'admin') return; 
    try { await Chat.updateMany({ room, role: 'user', read: false }, { read: true }); } catch(e) {}
  });

  socket.on('disconnect', () => {
    const d = online.get(socket.id);
    console.log(`❌ Disconnected: ${d?.userName || socket.id}`);
    online.delete(socket.id);
    msgRates.delete(socket.id);
    if (d?.room) botFails.delete(d.room);
    broadcastOnlineUsers();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  try {
    const cron = require('node-cron');
    const { updateOverdueCompliance } = require('./utils/compliance');
    cron.schedule('0 6 * * *', updateOverdueCompliance);
  } catch(e) {}
  server.listen(PORT, () => {
    console.log(`\n🚀 GST System running → http://localhost:${PORT}\n`);
  });
}).catch(err => {
  logger.error('❌ Failed to initialize database: ' + err.message);
  process.exit(1);
});
