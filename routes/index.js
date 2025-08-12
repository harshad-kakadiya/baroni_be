import express from 'express';
import authRouter from './api/auth.js';

const router = express.Router();

router.use('/auth', authRouter);

export default router;


