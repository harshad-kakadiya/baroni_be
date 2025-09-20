import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {storeMessageValidator} from "../../validators/storeMessageRequestValidators.js";
import {listMessages, storeMessage, getUserConversations} from "../../controllers/messages.js";
import { uploadChatMessage } from '../../middlewares/upload.js';

const router = express.Router();

router.use(requireAuth);

// Get all conversations for authenticated user
router.get('/conversations', getUserConversations);

// Get messages for a specific conversation
router.get('/:conversationId', listMessages);

// Store a new message (with optional image upload)
router.post('/', uploadChatMessage.single('image'), storeMessageValidator, storeMessage);

export default router;








