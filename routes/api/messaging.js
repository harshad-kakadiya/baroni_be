import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import {storeMessageValidator} from "../../validators/storeMessageRequestValidators.js";
import {listMessages, storeMessage, readMessage} from "../../controllers/messages.js";

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

router.get('/:conversationId', listMessages);
router.post('/', storeMessageValidator, storeMessage);
router.patch('/read', readMessage);

export default router;








