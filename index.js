import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import './config/db.js';
import './config/passport.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/errorHandler.js';
import notificationScheduler from './services/notificationScheduler.js';
import { startRefundScheduler } from './services/refundScheduler.js';
import { startWeeklyAvailabilityScheduler } from './services/weeklyAvailabilityScheduler.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/api', apiRoutes);
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'Baroni API', timestamp: new Date().toISOString() });
});

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Baroni API listening on port ${PORT}`);
  
  // Initialize notification scheduler
  notificationScheduler.init();
  
  // Start refund scheduler
  startRefundScheduler();
  
  // Start weekly availability scheduler
  startWeeklyAvailabilityScheduler();
});


