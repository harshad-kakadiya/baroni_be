import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { createDedication, listMyDedications, getDedication, updateDedication, deleteDedication } from '../../controllers/dedication.js';
import { idParamValidator, typePriceBodyValidator } from '../../validators/commonValidators.js';

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

router.get('/', listMyDedications);
router.get('/:id', idParamValidator, getDedication);
router.post('/', typePriceBodyValidator, createDedication);
router.put('/:id', idParamValidator, typePriceBodyValidator, updateDedication);
router.delete('/:id', idParamValidator, deleteDedication);

export default router;



















