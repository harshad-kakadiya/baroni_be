import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversationId: String,
    senderId: String,
    receiverId: String,
    message: String,
    type: {type: String, default: "text"},
    seenBy: [String]
}, {timestamps: true});

const MessageModel=  mongoose.model('Message', messageSchema);
export default MessageModel;
