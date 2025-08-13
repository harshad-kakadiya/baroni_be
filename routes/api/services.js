import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { createService, listMyServices, getService, updateService, deleteService } from '../../controllers/service.js';
import { idParamValidator, typePriceBodyValidator } from '../../validators/commonValidators.js';

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

router.get('/', listMyServices);
router.get('/:id', idParamValidator, getService);
router.post('/', typePriceBodyValidator, createService);
router.put('/:id', idParamValidator, typePriceBodyValidator, updateService);
router.delete('/:id', idParamValidator, deleteService);

export default router;


