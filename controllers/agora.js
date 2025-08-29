import {GenerateRtcAgoraToken, GenerateRtmAgoraToken} from "../config/agora.js";


export const AgoraRtmToken = (req,res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });

    const token = GenerateRtmAgoraToken(uid);
    res.json({ token });
}

export const AgoraRtcToken = (req,res) => {
    const { channel, uid } = req.body;
    if (!channel || !uid) return res.status(400).json({ error: "Channel and UID are required" });

    const token = GenerateRtcAgoraToken(uid, channel);
    res.json({ token });
}