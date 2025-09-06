import express from 'express';
import {AgoraRtcToken, AgoraRtmToken} from "../../controllers/agora.js";
import { requireAuth } from '../../middlewares/auth.js';

const router = express.Router();

router.post('/rtm-token', requireAuth, AgoraRtmToken);
router.post('/rtc-token', requireAuth, AgoraRtcToken);

export default router;









