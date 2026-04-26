const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Connection ────────────────────────────────────────────────────────────────
async function connectDb() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gst_system';
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
}

// ── Schemas & Models ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  password: String,
  role: { type: String, default: 'accountant' },
  phone: { type: String, default: '' },
  active: { type: Number, default: 1 },
  isBlocked: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  blockedAt: Date,
  blockedBy: mongoose.Schema.Types.ObjectId,
  blockReason: String,
  googleId: String, facebookId: String, githubId: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: String,
  emailVerifyExpires: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const businessSchema = new mongoose.Schema({
  gstin: { type: String, unique: true },
  legal_name: String, trade_name: String, address: String,
  state_code: String, registration_type: { type: String, default: 'Regular' },
  pan: String, email: String, phone: String,
  active: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at' } });

const userBusinessSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  business_id: mongoose.Schema.Types.ObjectId,
});

const partySchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  name: String, gstin: String, pan: String, email: String,
  phone: String, address: String, state_code: String,
  party_type: { type: String, default: 'customer' },
  is_registered: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at' } });

const invoiceItemSchema = new mongoose.Schema({
  invoice_id: mongoose.Schema.Types.ObjectId,
  description: String, hsn_sac: String, uom: String,
  quantity: Number, unit_price: Number, discount: { type: Number, default: 0 },
  taxable_value: Number, gst_rate: Number,
  cgst_rate: Number, sgst_rate: Number, igst_rate: Number,
  cgst: Number, sgst: Number, igst: Number,
  cess_rate: { type: Number, default: 0 }, cess: { type: Number, default: 0 },
  total: Number,
});

const invoiceSchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  invoice_number: String, invoice_date: String,
  invoice_type: { type: String, default: 'B2B' },
  supply_type: { type: String, default: 'intra' },
  party_id: mongoose.Schema.Types.ObjectId,
  party_name: String, party_gstin: String, party_state_code: String,
  place_of_supply: String, reverse_charge: { type: Number, default: 0 },
  taxable_value: Number, cgst: Number, sgst: Number, igst: Number,
  cess: Number, total_amount: Number,
  tds_amount: { type: Number, default: 0 }, tcs_amount: { type: Number, default: 0 },
  irn: String, ack_no: String, ack_date: Date, ewb_number: String, ewb_date: Date,
  status: { type: String, default: 'draft' }, notes: String,
  // Payment tracking
  payment_status: { type: String, enum: ['unpaid','partial','paid'], default: 'unpaid' },
  amount_paid: { type: Number, default: 0 },
  payment_due_date: String,
  payment_date: String,
  payment_method: String,
  payment_notes: String,
  created_by: mongoose.Schema.Types.ObjectId,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const purchaseSchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  invoice_number: String, invoice_date: String,
  party_id: mongoose.Schema.Types.ObjectId, party_gstin: String, supplier_name: String,
  taxable_value: Number, cgst: Number, sgst: Number, igst: Number,
  cess: { type: Number, default: 0 }, total_amount: Number,
  itc_eligible: { type: Number, default: 1 }, itc_availed: { type: Number, default: 0 },
  gstr2b_matched: { type: Number, default: 0 },
  match_status: { type: String, default: 'pending' },
  status: { type: String, default: 'draft' },
  // Payment tracking
  payment_status: { type: String, enum: ['unpaid','partial','paid'], default: 'unpaid' },
  amount_paid: { type: Number, default: 0 },
  payment_due_date: String,
  payment_date: String,
  payment_method: String,
  created_by: mongoose.Schema.Types.ObjectId,
}, { timestamps: { createdAt: 'created_at' } });

const returnSchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  return_type: String, period: String,
  status: { type: String, default: 'draft' },
  total_taxable: Number, total_cgst: Number, total_sgst: Number,
  total_igst: Number, total_cess: Number,
  itc_claimed: Number, net_liability: Number,
  filed_at: Date, arn: String, json_data: String,
  created_by: mongoose.Schema.Types.ObjectId,
}, { timestamps: { createdAt: 'created_at' } });

const hsnSchema = new mongoose.Schema({
  code: String, type: String, description: String,
  gst_rate: Number, cess_rate: { type: Number, default: 0 },
});

const complianceSchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  return_type: String, period: String, due_date: String,
  status: { type: String, default: 'pending' },
  filed_date: String, penalty_amount: { type: Number, default: 0 },
});

const auditSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  business_id: mongoose.Schema.Types.ObjectId,
  action: String, entity_type: String,
  entity_id: mongoose.Schema.Types.ObjectId,
  old_data: String, new_data: String, ip_address: String,
}, { timestamps: { createdAt: 'created_at' } });

const tdsSchema = new mongoose.Schema({
  business_id: mongoose.Schema.Types.ObjectId,
  entry_type: String,
  party_id: mongoose.Schema.Types.ObjectId,
  invoice_id: mongoose.Schema.Types.ObjectId,
  section: String, base_amount: Number, rate: Number, amount: Number,
  period: String, status: { type: String, default: 'pending' },
}, { timestamps: { createdAt: 'created_at' } });

const User        = mongoose.model('User',        userSchema);
const Business    = mongoose.model('Business',    businessSchema);
const UserBusiness= mongoose.model('UserBusiness',userBusinessSchema);
const Party       = mongoose.model('Party',       partySchema);
const InvoiceItem = mongoose.model('InvoiceItem', invoiceItemSchema);
const Invoice     = mongoose.model('Invoice',     invoiceSchema);
const Purchase    = mongoose.model('Purchase',    purchaseSchema);
const Return      = mongoose.model('Return',      returnSchema);
const Hsn         = mongoose.model('Hsn',         hsnSchema);
const Compliance  = mongoose.model('Compliance',  complianceSchema);
const AuditLog    = mongoose.model('AuditLog',    auditSchema);
const TdsTcs      = mongoose.model('TdsTcs',      tdsSchema);

// Chat models
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ChatAuditLog = require('../models/ChatAuditLog');

// ── Seed ──────────────────────────────────────────────────────────────────────
async function initDb() {
  await connectDb();

  if (!(await Hsn.countDocuments())) {
    const hsns = [
      ['0101','HSN','Live horses, asses, mules',0,0],
      ['0901','HSN','Coffee, whether or not roasted',5,0],
      ['1001','HSN','Wheat and meslin',0,0],
      ['1701','HSN','Cane or beet sugar',5,0],
      ['2201','HSN','Waters, ice and snow',12,0],
      ['2710','HSN','Petroleum oils',18,0],
      ['3004','HSN','Medicaments for retail sale',12,0],
      ['3401','HSN','Soap and surface-active products',18,0],
      ['4901','HSN','Printed books, brochures',0,0],
      ['6101','HSN','Mens overcoats, windcheaters',12,0],
      ['7108','HSN','Gold in non-monetary form',3,0],
      ['8471','HSN','Computers and data-processing machines',18,0],
      ['8517','HSN','Telephones including smartphones',18,0],
      ['8703','HSN','Motor cars and vehicles',28,22],
      ['9403','HSN','Furniture',18,0],
      ['996111','SAC','Hotel accommodation services',12,0],
      ['996311','SAC','Restaurant services',5,0],
      ['997212','SAC','Rental of commercial property',18,0],
      ['998311','SAC','IT consulting and management services',18,0],
      ['999299','SAC','Other miscellaneous services',18,0],
    ];
    await Hsn.insertMany(hsns.map(([code,type,description,gst_rate,cess_rate]) => ({ code,type,description,gst_rate,cess_rate })));
  }

  if (!(await User.findOne({ email: 'admin@gst.local' }))) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    await User.create({ name: 'Administrator', email: 'admin@gst.local', password: hash, role: 'admin', emailVerified: true });
    console.log('✅ Default admin: admin@gst.local / Admin@123');
  } else {
    // Ensure existing admin is verified
    await User.updateOne({ email: 'admin@gst.local' }, { emailVerified: true });
  }
  console.log('✅ MongoDB Database ready');
}

module.exports = {
  initDb,
  User, Business, UserBusiness, Party,
  Invoice, InvoiceItem, Purchase, Return,
  Hsn, Compliance, AuditLog, TdsTcs,
  Conversation, Message, ChatAuditLog,
};
