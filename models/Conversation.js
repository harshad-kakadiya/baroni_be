import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    participants: [String],
    lastMessage: String,
    lastMessageAt: Date
}, { timestamps: true });

const ConversationModel = mongoose.model('Conversation', conversationSchema);
export default ConversationModel;