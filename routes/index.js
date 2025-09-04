import express from 'express';
import authRouter from './api/auth.js';
import starRouter from './api/star.js';
import categoryRouter from './api/category.js';
import dedicationsRouter from './api/dedications.js';
import dedicationRequestsRouter from './api/dedicationRequests.js';
import servicesRouter from './api/services.js';
import dedicationSamplesRouter from './api/dedicationSamples.js';
import availabilitiesRouter from './api/availabilities.js';
import appointmentsRouter from './api/appointments.js';
import dashboardRouter from './api/dashboard.js';
import contactSupportRouter from './api/contactSupport.js';
import transactionRouter from './api/transactions.js';
import favoritesRouter from './api/favorites.js';
import liveShowsRouter from './api/liveShows.js';
import reportUsersRouter from './api/reportUsers.js';
import agoraRouter from './api/agora.js';
import Messaging from "./api/messaging.js";
import notificationsRouter from './api/notifications.js';
import ratingsRouter from './api/ratings.js';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/category', categoryRouter);
router.use('/dedications' , dedicationsRouter);
router.use('/dedication-requests', dedicationRequestsRouter);
router.use('/services', servicesRouter);
router.use('/dedication-samples', dedicationSamplesRouter);
router.use('/availabilities', availabilitiesRouter);
router.use('/appointments',appointmentsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/contact-support', contactSupportRouter);
router.use('/transactions', transactionRouter);
router.use('/star',starRouter);
router.use('/favorites', favoritesRouter);
router.use('/live-shows', liveShowsRouter);
router.use('/report-users', reportUsersRouter);
router.use('/messages', Messaging);
router.use('/agora', agoraRouter);
router.use('/notifications', notificationsRouter);
router.use('/ratings', ratingsRouter);

export default router;



