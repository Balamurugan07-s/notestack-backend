import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server.js';
import User from '../models/User.js';
import Note from '../models/Note.js';
import { closeDB } from '../config/db.js';

describe('Notes Endpoints', () => {
  const testUser = {
    name: 'Uploader Student',
    email: 'uploader@test.com',
    password: 'Password123!',
  };

  let userToken = '';
  let noteId = '';
  let secureToken = '';

  beforeAll(async () => {
    // Wait for DB connection
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await User.deleteMany({});
      await Note.deleteMany({});
      
      // Register & verify user to get token
      await request(app).post('/api/auth/register').send(testUser);
      const user = await User.findOne({ email: testUser.email });
      user.isVerified = true;
      await user.save();

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      userToken = loginRes.body.token;
    } catch (e) {
      console.warn('DB initialization error:', e);
    }
  });

  afterAll(async () => {
    try {
      await User.deleteMany({});
      await Note.deleteMany({});
      
      // Clean up local uploads created during test
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        for (const file of files) {
          // delete files uploaded for testing
          if (file.startsWith('file-')) {
            fs.unlinkSync(path.join(uploadDir, file));
          }
        }
      }
    } catch (e) {
      console.warn('Post-test cleanup error:', e);
    }
    await closeDB();
  });

  it('should upload a study note successfully', async () => {
    const testFilePath = path.join(process.cwd(), 'tests', 'test_note.txt');

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', 'Introduction to Algorithms')
      .field('description', 'Algorithmic paradigms and time complexities')
      .field('subject', 'Computer Science')
      .field('tags', 'algorithms, cs, study')
      .field('isPrivate', 'false')
      .attach('file', testFilePath);

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.note.title).toEqual('Introduction to Algorithms');
    noteId = res.body.note._id;
  });

  it('should reject file upload containing malware signature', async () => {
    // Write a temp malware test file containing trigger keyword
    const malwareFilePath = path.join(process.cwd(), 'tests', 'malware_test.txt');
    fs.writeFileSync(malwareFilePath, 'This file has malware-test-trigger-word inside.');

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', 'Cheatsheet')
      .field('description', 'Exam cheatsheet')
      .field('subject', 'Math')
      .attach('file', malwareFilePath);

    // Remove temp file
    if (fs.existsSync(malwareFilePath)) {
      fs.unlinkSync(malwareFilePath);
    }

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Security scan rejected');
  });

  it('should list notes matching filter criteria', async () => {
    const res = await request(app)
      .get('/api/notes')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ search: 'Algorithms' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notes.length).toBeGreaterThan(0);
    expect(res.body.notes[0].title).toEqual('Introduction to Algorithms');
  });

  it('should generate a secure signed download token', async () => {
    const res = await request(app)
      .get(`/api/notes/${noteId}/download`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.downloadUrl).toBeDefined();

    // Extract token
    secureToken = res.body.downloadUrl.split('/').pop();
  });

  it('should download file using valid token', async () => {
    const res = await request(app)
      .get(`/api/notes/download/secure/${secureToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-disposition']).toBeDefined();
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('should reject expired or modified download token', async () => {
    const res = await request(app)
      .get(`/api/notes/download/secure/${secureToken}invalidated`);

    expect(res.statusCode).toEqual(403);
  });

  it('should fetch public stats successfully', async () => {
    const res = await request(app)
      .get('/api/notes/public/stats');

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.studyNotesCount).toBeDefined();
    expect(res.body.activeStudentsCount).toBeDefined();
    expect(res.body.academicProgramsCount).toBeDefined();
  });
});

