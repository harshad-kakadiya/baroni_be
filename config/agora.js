import agora from 'agora-access-token'

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const AGORA_TOKEN_EXPIRATION = 3600; // Token valid for 1 hour

export function GenerateRtmAgoraToken(userId) {
    return agora.RtmTokenBuilder.buildToken(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        userId,
        agora.RtmRole.Rtm_User,
        Math.floor(Date.now() / 1000) + AGORA_TOKEN_EXPIRATION
    );
}

export function GenerateRtcAgoraToken(userId, channelName) {
    return agora.RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        channelName,
        Number(userId),
        agora.RtcRole.PUBLISHER,
        Math.floor(Date.now() / 1000) + AGORA_TOKEN_EXPIRATION
    );
}

