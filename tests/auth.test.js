const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/gst_test_auth';
process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

let app;

beforeAll(async () => {
  const express = require('express');
  const { initDb, User } = require('../backend/utils/db');

  // Drop test DB first to ensure clean state
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();

  app = express();
  app.use(express.json());
  app.use('/api/auth', require('../backend/routes/auth'));

  await initDb();

  // Create verified test admin
  await User.findOneAndUpdate(
    { email: 'testadmin@gst.local' },
    { name: 'Test Admin', email: 'testadmin@gst.local', password: bcrypt.hashSync('Test@123', 10), role: 'admin', active: 1, emailVerified: true },
    { upsert: true, returnDocument: 'after' }
  );
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('POST /api/auth/login', () => {
  it('returns token on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'testadmin@gst.local', password: 'Test@123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects invalid password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'testadmin@gst.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'testadmin@gst.local' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'notanemail', password: 'Test@123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  it('creates a new user and auto-verifies in dev/test mode', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'New User', email: 'newuser@test.com', password: 'Pass@123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/created/i);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'dup@test.com', password: 'Pass@123' });
    const res = await request(app).post('/api/auth/register').send({ name: 'Dup2', email: 'dup@test.com', password: 'Pass@123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in use/i);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test', email: 'short@test.com', password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns success even for unknown email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns reset token for known email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'testadmin@gst.local' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});
