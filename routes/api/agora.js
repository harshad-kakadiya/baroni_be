import express from 'express';
import {AgoraRtcToken, AgoraRtmToken} from "../../controllers/agora.js";

const router = express.Router();

router.post('/rtm-token', AgoraRtmToken);
router.post('/rtc-token', AgoraRtcToken);

export default router;









