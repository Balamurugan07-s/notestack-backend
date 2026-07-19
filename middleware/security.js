import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import xssClean from 'xss-clean';
import rateLimit from 'express-rate-limit';

// CORS configuration - allow frontend origin
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// General rate limiter for API calls
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // limit each IP to 150 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for authentication routes (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 login/register requests per windowMs
  message: {
    success: false,
    error: 'Too many login or registration attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure all security middlewares
export const applySecurityMiddlewares = (app) => {
  // HTTP security headers
  app.use(helmet());

  // Enable CORS
  app.use(cors(corsOptions));

  // Sanitize data against NoSQL injection
  app.use(mongoSanitize());

  // Sanitize user input against XSS
  app.use(xssClean());
};
