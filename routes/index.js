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
import favoritesRouter from './api/favorites.js';
import {requireAuth} from "../middlewares/auth.js";

const router = express.Router();

router.use('/auth', authRouter);
router.use('/category', requireAuth, categoryRouter);
router.use('/dedications',requireAuth , dedicationsRouter);
router.use('/dedication-requests', requireAuth, dedicationRequestsRouter);
router.use('/services', requireAuth, servicesRouter);
router.use('/dedication-samples', requireAuth, dedicationSamplesRouter);
router.use('/availabilities', requireAuth, availabilitiesRouter);
router.use('/appointments', requireAuth,appointmentsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/contact-support', contactSupportRouter);
router.use('/star', requireAuth,starRouter);
router.use('/favorites', favoritesRouter);

export default router;



