import MessageModel from '../models/Message.js';
import ConversationModel from '../models/Conversation.js';
import User from '../models/User.js';
import NotificationHelper from '../utils/notificationHelper.js';

export const storeMessage = async (req, res) => {
    const { conversationId, receiverId, message, type } = req.body;
    const authSenderId = req.user && req.user._id ? req.user._id : null;

    if (!authSenderId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let actualConversationId = conversationId;

    // If no conversationId provided, create or find conversation between sender and receiver
    if (!conversationId && authSenderId && receiverId) {
        // Validate conversation rules before creating/finding conversation
        if (String(authSenderId) === String(receiverId)) {
            return res.status(400).json({
                success: false,
                message: 'You cannot start a conversation with yourself'
            });
        }

        // Get sender and receiver user details to validate roles
        const [sender, receiver] = await Promise.all([
            User.findById(authSenderId).select('role'),
            User.findById(receiverId).select('role')
        ]);

        if (!sender || !receiver) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sender or receiver'
            });
        }

        // Check if both users are fans (not allowed)
        if (sender.role === 'fan' && receiver.role === 'fan') {
            return res.status(400).json({
                success: false,
                message: 'Fans cannot start conversations with other fans'
            });
        }

        // Check if both users are stars (not allowed)
        if (sender.role === 'star' && receiver.role === 'star') {
            return res.status(400).json({
                success: false,
                message: 'Stars cannot start conversations with other stars'
            });
        }

        // Check if both users are admins (not allowed)
        if (sender.role === 'admin' && receiver.role === 'admin') {
            return res.status(400).json({
                success: false,
                message: 'Admins cannot start conversations with other admins'
            });
        }

        const participants = [String(authSenderId), String(receiverId)].sort();

        let conversation = await ConversationModel.findOne({ participants });

        if (!conversation) {
            // Create new conversation
            conversation = await ConversationModel.create({
                participants,
                lastMessage: '',
                lastMessageAt: null
            });
        }

        actualConversationId = conversation._id.toString();
    }

    if (!actualConversationId) {
        return res.status(400).json({
            success: false,
            message: 'Conversation ID is required or receiverId must be provided'
        });
    }

    const msg = await MessageModel.create({
        conversationId: actualConversationId,
        senderId: authSenderId,
        receiverId,
        message,
        type
    });

    await ConversationModel.findByIdAndUpdate(actualConversationId, {
        lastMessage: message,
        lastMessageAt: new Date()
    });

    // Send notification to receiver about new message
    try {
      await NotificationHelper.sendMessageNotification(msg, {
        senderId: authSenderId.toString(),
        conversationId: actualConversationId
      });
    } catch (notificationError) {
      console.error('Error sending message notification:', notificationError);
    }

    res.json({ ...msg.toObject(), conversationId: actualConversationId });
};

export const listMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;

        const messages = await MessageModel.find({ conversationId })
            .sort({ createdAt: 1 })
            .populate('senderId', 'name pseudo profilePic baroniId role')
            .populate('receiverId', 'name pseudo profilePic baroniId role')
            .lean();

        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
}

export const getUserConversations = async (req, res) => {
    try {
        const userId = String(req.user._id);

        // Get conversations where user is a participant
        const conversations = await ConversationModel.find({
            participants: userId
        })
        .sort({ lastMessageAt: -1 })
        .lean();

        // Get participant details for each conversation
        const conversationsWithDetails = await Promise.all(
            conversations.map(async (conv) => {
                // Get the other participant (not the current user)
                const otherParticipantId = conv.participants.find(participantId => participantId !== userId);

                // Get user details for the other participant
                const otherUser = await User.findById(otherParticipantId)
                    .select('name pseudo profilePic baroniId role')
                    .lean();

                return {
                    _id: conv._id,
                    lastMessage: conv.lastMessage,
                    lastMessageAt: conv.lastMessageAt,
                    otherParticipant: otherUser,
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt
                };
            })
        );

        res.json({
            success: true,
            data: conversationsWithDetails
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations',
            error: error.message
        });
    }
};
