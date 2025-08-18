import express from 'express';
import authRouter from './api/auth.js';
import categoryRouter from './api/category.js';
import dedicationsRouter from './api/dedications.js';
import servicesRouter from './api/services.js';
import dedicationSamplesRouter from './api/dedicationSamples.js';
import availabilitiesRouter from './api/availabilities.js';
import appointmentsRouter from './api/appointments.js';
import {requireAuth} from "../middlewares/auth.js";

const router = express.Router();

router.use('/auth', authRouter);
router.use('/category', requireAuth, categoryRouter);
router.use('/dedications',requireAuth , dedicationsRouter);
router.use('/services', requireAuth, servicesRouter);
router.use('/dedication-samples', requireAuth, dedicationSamplesRouter);
router.use('/availabilities', requireAuth, availabilitiesRouter);
router.use('/appointments', appointmentsRouter);

export default router;



