import express from 'express';
import { getDashboard } from '../../controllers/dashboard.js';
import {requireAuth} from "../../middlewares/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get('/', getDashboard);

export default router;
















