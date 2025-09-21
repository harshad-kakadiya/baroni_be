import {GenerateRtcAgoraToken, GenerateRtmAgoraToken} from "../config/agora.js";


export const AgoraRtmToken = (req,res) => {
    const uid = req.user && req.user.baroniId ? Number(req.user.baroniId) : String (req.user._id);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const token = GenerateRtmAgoraToken(uid);
    res.json({ token });
}

export const AgoraRtcToken = (req,res) => {
    const { channel } = req.body;
    const uid = req.user && req.user.baroniId ? Number(req.user.baroniId) : String(req.user._id);

    if (!channel) return res.status(400).json({ error: "Channel is required" });
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const token = GenerateRtcAgoraToken(uid, channel);
    res.json({ token });
}
