const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Business, UserBusiness } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }
  next();
};

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', [
  body('email').trim().isEmail(),
  body('password').notEmpty(),
  validate
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase(), active: 1 });
    if (!user || !user.password || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    // Email verification disabled - users can login immediately
    // if (user.emailVerified === false && user.emailVerifyToken)
    //   return res.status(403).json({ success: false, message: 'Please verify your email before logging in.', unverified: true });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'gst_secret', { expiresIn: '30m' });
    const ubLinks = await UserBusiness.find({ user_id: user._id });
    const bizIds = ubLinks.map(u => u.business_id);
    const businesses = await Business.find({ _id: { $in: bizIds }, active: 1 }).lean();
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role }, businesses: businesses.map(b => ({ ...b, id: b._id })) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Profile — GET ─────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('name email phone role active created_at').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { ...user, id: String(user._id) } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Profile — PUT ─────────────────────────────────────────────────────────────
router.put('/profile', auth, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('phone').optional({ checkFalsy: true }).trim(),
  validate
], async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user._id } });
    if (existing) return res.status(400).json({ success: false, message: 'Email is already in use by another account' });
    await User.findByIdAndUpdate(req.user._id, { name: name.trim(), email: email.toLowerCase().trim(), phone: phone?.trim() || '' });
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  const ubLinks = await UserBusiness.find({ user_id: req.user._id });
  const bizIds = ubLinks.map(u => u.business_id);
  const businesses = await Business.find({ _id: { $in: bizIds }, active: 1 }).lean();
  res.json({ success: true, user: req.user, businesses: businesses.map(b => ({ ...b, id: b._id })) });
});

// ── Change Password ───────────────────────────────────────────────────────────
router.post('/change-password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  validate
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    user.password = bcrypt.hashSync(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });
    const hash = bcrypt.hashSync(password, 10);
    const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS &&
      !process.env.EMAIL_USER.includes('your_email'));

    // Only require email verification if email is properly configured
    const requireVerification = emailConfigured;
    const verifyToken = requireVerification ? crypto.randomBytes(32).toString('hex') : undefined;

    const user = await User.create({
      name, email: email.toLowerCase(), password: hash, role: 'accountant',
      emailVerified: !requireVerification,
      emailVerifyToken: verifyToken,
      emailVerifyExpires: verifyToken ? Date.now() + 24 * 60 * 60 * 1000 : undefined,
    });

    if (requireVerification) {
      try {
        const { sendVerificationEmail } = require('../utils/mailer');
        await sendVerificationEmail(user.email, user.name, verifyToken);
        return res.json({ success: true, message: 'Account created! Please check your email to verify before logging in.' });
      } catch(mailErr) {
        // Email failed — auto-verify so user isn't locked out
        console.warn('Email send failed, auto-verifying account:', mailErr.message);
        await user.updateOne({ emailVerified: true, emailVerifyToken: undefined });
      }
    }
    res.json({ success: true, message: 'Account created successfully. You can now log in.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Verify Email ──────────────────────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    const user = await User.findOne({ emailVerifyToken: token, emailVerifyExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();
    res.json({ success: true, message: 'Email verified! You can now log in.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Resend Verification ───────────────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase(), active: 1 });
    if (!user) return res.json({ success: true, message: 'If that email exists, a verification link was sent' });
    if (user.emailVerified) return res.status(400).json({ success: false, message: 'Email already verified' });
    const verifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = verifyToken;
    user.emailVerifyExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    try {
      const { sendVerificationEmail } = require('../utils/mailer');
      await sendVerificationEmail(user.email, user.name, verifyToken);
    } catch(mailErr) {
      console.log(`[SIMULATED] Verify token for ${user.email}: ${verifyToken}`);
    }
    res.json({ success: true, message: 'Verification email sent' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Forgot Password ───────────────────────────────────────────────────────────
router.post('/forgot-password', [
  body('email').trim().isEmail().withMessage('Valid email required'),
  validate
], async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase(), active: 1 });
    if (!user) return res.json({ success: true, message: 'If email exists, a reset link has been sent' });
    const token = crypto.randomBytes(3).toString('hex').toUpperCase();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    console.log(`\n[SIMULATED EMAIL] To: ${user.email} | Reset Token: ${token}\n`);
    res.json({ success: true, token, message: `Reset token generated: ${token}` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Reset Password ────────────────────────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    const user = await User.findOne({ resetPasswordToken: req.body.token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Token is invalid or has expired.' });
    user.password = bcrypt.hashSync(req.body.password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.emailVerified = true; // ensure login works after reset
    user.emailVerifyToken = undefined;
    await user.save();
    res.json({ success: true, message: 'Password has been successfully changed.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── OAuth ─────────────────────────────────────────────────────────────────────
const passport = require('passport');

const handleOAuthLogin = (req, res) => {
  if (!req.user) return res.redirect('/#error=oauth_failed');
  const token = jwt.sign({ id: req.user._id, role: req.user.role }, process.env.JWT_SECRET || 'gst_secret', { expiresIn: '30m' });
  res.redirect(`/#oauth?token=${token}`);
};

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/#error=google_failed' }), handleOAuthLogin);

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/#error=facebook_failed' }), handleOAuthLogin);

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', { failureRedirect: '/#error=github_failed' }), handleOAuthLogin);

module.exports = router;
