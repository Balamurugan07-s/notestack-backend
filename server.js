import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { connectDB, closeDB } from './config/db.js';
import { applySecurityMiddlewares, generalLimiter } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Load Env variables
dotenv.config();

const app = express();

// Apply Security Middlewares (Helmet, CORS, MongoSanitize, XSSClean)
applySecurityMiddlewares(app);

// Request body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static upload files (for local dev mode fallback)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// General API request rate limiting
app.use('/api', generalLimiter);

// Map API Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/queries', queryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Serve frontend static assets in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), '../client/dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    // If it is an API route, send JSON 404 instead of index.html
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Base Status Route
  app.get('/', (req, res) => {
    res.json({ success: true, message: 'NoteStack Security-Hardened API is running' });
  });

  // Route Not Found fallback
  app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Resource path not found' });
  });
}

// Global Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect database and start server
const startServer = async () => {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`🔥 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  // Handle server shutdown signals
  const shutdown = async () => {
    console.log('\n🛑 Shutdown signal received. Closing connections...');
    server.close(async () => {
      await closeDB();
      console.log('👋 Clean exit completed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

// Start application only if not running tests
if (process.env.NODE_ENV !== 'test') {
  startServer();
} else {
  connectDB();
}

export default app;
