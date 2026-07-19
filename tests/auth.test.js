import request from 'supertest';
import app from '../server.js';
import User from '../models/User.js';
import { closeDB } from '../config/db.js';

describe('Auth Endpoints', () => {
  const testUser = {
    name: 'Test Student',
    email: 'student@test.com',
    password: 'Password123!',
    college: 'Test University',
    course: 'Computer Science',
    year: '3rd',
  };

  let otpCode = '';

  beforeAll(async () => {
    // Wait for DB connection to establish
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await User.deleteMany({});
    } catch (e) {
      console.warn('DB delete warning:', e);
    }
  });

  afterAll(async () => {
    try {
      await User.deleteMany({});
    } catch (e) {
      console.warn('DB delete warning:', e);
    }
    await closeDB();
  });

  it('should register a new user pending verification', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Verification OTP sent');
    
    // Fetch the OTP from the DB for testing verification
    const user = await User.findOne({ email: testUser.email });
    expect(user).toBeDefined();
    expect(user.isVerified).toBe(false);
    otpCode = user.verificationOTP;
    expect(otpCode).toBeDefined();
  });

  it('should fail registration for duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('should verify the email with correct OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({
        email: testUser.email,
        otp: otpCode,
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: testUser.email });
    expect(user.isVerified).toBe(true);
  });

  it('should login verified user and return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toEqual(testUser.email);
  });

  it('should reject login for wrong credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'wrongpassword',
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.success).toBe(false);
  });
});
