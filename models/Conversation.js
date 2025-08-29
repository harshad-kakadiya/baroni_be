import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    participants: [String],
    lastMessage: String,
    lastMessageAt: Date,
    unreadCount: Object
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);