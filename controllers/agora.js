import {GenerateRtcAgoraToken, GenerateRtmAgoraToken} from "../config/agora.js";


export const AgoraRtmToken = (req,res) => {
    const uid = req.user && req.user._id ? String(req.user._id) : null;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const token = GenerateRtmAgoraToken(uid);
    res.json({ token });
}

export const AgoraRtcToken = (req,res) => {
    const { channel, uid } = req.body;
    if (!channel || !uid) return res.status(400).json({ error: "Channel and UID are required" });

    const token = GenerateRtcAgoraToken(uid, channel);
    res.json({ token });
}