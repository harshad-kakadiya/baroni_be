import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversationId: String,
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: String,
    type: {type: String, default: "text"},
    imageUrl: {
        type: String,
        default: "https://res.cloudinary.com/ddnpvm2yk/image/upload/v1759868390/placeholder_aws6oc.png"
    }
}, {timestamps: true});

const MessageModel = mongoose.model('Message', messageSchema);
export default MessageModel;
