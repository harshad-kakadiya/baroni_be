import MessageModel from '../models/Message.js';
import ConversationModel from '../models/Conversation.js';

export const storeMessage = async (req, res) => {
    const { conversationId, senderId, receiverId, message, type } = req.body;

    const msg = await MessageModel.create({
        conversationId, senderId, receiverId, message, type
    });

    await ConversationModel.findByIdAndUpdate(conversationId, {
        lastMessage: message,
        lastMessageAt: new Date(),
        $inc: { [`unreadCount.${receiverId}`]: 1 }
    });

    res.json(msg);
};

export const listMessages = async (req, res) => {
    const { conversationId } = req.params;
    const messages = await MessageModel.find({ conversationId }).sort({ createdAt: 1 });
    res.json(messages);
}

export const readMessage = async (req, res) => {
    const { conversationId, userId } = req.body;

    await MessageModel.updateMany(
        { conversationId, seenBy: { $ne: userId } },
        { $push: { seenBy: userId } }
    );

    await ConversationModel.findByIdAndUpdate(conversationId, {
        $set: { [`unreadCount.${userId}`]: 0 }
    });

    res.json({ success: true });
}