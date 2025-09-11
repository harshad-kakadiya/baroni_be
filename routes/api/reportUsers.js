import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { createReport, listReports, getReportById, updateReport, deleteReport } from '../../controllers/reportUser.js';
import { createReportValidator, updateReportValidator } from '../../validators/reportUserValidators.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', createReportValidator, createReport);
router.get('/', listReports);
router.get('/:id', getReportById);
router.put('/:id', updateReportValidator, updateReport);
router.delete('/:id', deleteReport);

export default router;





