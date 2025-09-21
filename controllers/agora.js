import {GenerateRtcAgoraToken, GenerateRtmAgoraToken} from "../config/agora.js";
import { ensureUserAgoraKey } from "../utils/agoraKeyGenerator.js";

export const AgoraRtmToken = async (req,res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        
        const agoraKey = await ensureUserAgoraKey(req.user);
        const uid = Number(agoraKey);

        const token = GenerateRtmAgoraToken(uid);
        res.json({ token });
    } catch (error) {
        console.error('Error generating RTM token:', error);
        res.status(500).json({ error: "Internal server error" });
    }
}

export const AgoraRtcToken = async (req,res) => {
    try {
        const { channel } = req.body;
        
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        if (!channel) return res.status(400).json({ error: "Channel is required" });

        const agoraKey = await ensureUserAgoraKey(req.user);
        const uid = Number(agoraKey);

        const token = GenerateRtcAgoraToken(uid, channel);
        res.json({ token });
    } catch (error) {
        console.error('Error generating RTC token:', error);
        res.status(500).json({ error: "Internal server error" });
    }
}
