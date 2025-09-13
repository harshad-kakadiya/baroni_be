import ConversationModel from '../models/Conversation.js';
import MessageModel from '../models/Message.js';

export const deleteConversationBetweenUsers = async (userIdA, userIdB) => {
  try {
    const a = String(userIdA);
    const b = String(userIdB);
    const participants = [a, b].sort();

    const conversation = await ConversationModel.findOne({ participants });
    if (!conversation) return { deletedMessages: 0, deletedConversations: 0 };

    const conversationId = String(conversation._id);
    const msgResult = await MessageModel.deleteMany({ conversationId });
    await ConversationModel.deleteOne({ _id: conversation._id });
    return {
      deletedMessages: msgResult?.deletedCount || 0,
      deletedConversations: 1
    };
  } catch (err) {
    // Swallow errors to avoid breaking main flow; caller may log if needed
    return { error: err.message };
  }
};




