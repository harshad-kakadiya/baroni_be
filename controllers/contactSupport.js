import { validationResult } from 'express-validator';
import ContactSupport from '../models/ContactSupport.js';
import { uploadFile } from '../utils/uploadFile.js';

// Create a new support ticket
export const createSupportTicket = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { issueType, description } = req.body;
    const userId = req.user.id;

    let imageUrl = null;

    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find(file => file.fieldname === 'image');
      if (imageFile) {
        try {
          imageUrl = await uploadFile(imageFile.buffer);
        } catch (uploadError) {
          return res.status(400).json({
            success: false,
            message: 'Error uploading image: ' + uploadError.message
          });
        }
      }
    }

    const supportTicket = await ContactSupport.create({
      issueType,
      description,
      image: imageUrl,
      userId
    });

    // Populate user details
    await supportTicket.populate('userId', 'name email baroniId');

    return res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: supportTicket
    });
  } catch (err) {
    console.error('Error creating support ticket:', err);
    return res.status(500).json({
      success: false,
      message: 'Error creating support ticket',
      error: err.message
    });
  }
};

// Get all support tickets for a user
export const getUserSupportTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const tickets = await ContactSupport.find({ userId })
      .populate('userId', 'name email baroniId')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (err) {
    console.error('Error fetching user support tickets:', err);
    return res.status(500).json({
      success: false,
      message: 'Error fetching support tickets',
      error: err.message
    });
  }
};

// Get a specific support ticket by ID
export const getSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const ticket = await ContactSupport.findById(id)
      .populate('userId', 'name email baroniId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Check if user owns the ticket or is admin
    if (ticket.userId._id.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    return res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (err) {
    console.error('Error fetching support ticket:', err);
    return res.status(500).json({
      success: false,
      message: 'Error fetching support ticket',
      error: err.message
    });
  }
};

// Update a support ticket
export const updateSupportTicket = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { issueType, description } = req.body;

    const ticket = await ContactSupport.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Check if user owns the ticket or is admin
    if (ticket.userId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let imageUrl = ticket.image;

    // Handle image upload if new image is provided
    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find(file => file.fieldname === 'image');
      if (imageFile) {
        try {
          imageUrl = await uploadFile(imageFile.buffer);
        } catch (uploadError) {
          return res.status(400).json({
            success: false,
            message: 'Error uploading image: ' + uploadError.message
          });
        }
      }
    }

    const updatedTicket = await ContactSupport.findByIdAndUpdate(
      id,
      {
        issueType,
        description,
        image: imageUrl
      },
      { new: true }
    ).populate('userId', 'name email baroniId');

    return res.status(200).json({
      success: true,
      message: 'Support ticket updated successfully',
      data: updatedTicket
    });
  } catch (err) {
    console.error('Error updating support ticket:', err);
    return res.status(500).json({
      success: false,
      message: 'Error updating support ticket',
      error: err.message
    });
  }
};

// Delete a support ticket
export const deleteSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const ticket = await ContactSupport.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    // Check if user owns the ticket or is admin
    if (ticket.userId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await ContactSupport.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Support ticket deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting support ticket:', err);
    return res.status(500).json({
      success: false,
      message: 'Error deleting support ticket',
      error: err.message
    });
  }
};

// Admin: Get all support tickets
export const getAllSupportTickets = async (req, res) => {
  try {
    const { issueType } = req.query;

    const filter = {};
    if (issueType) filter.issueType = issueType;

    const tickets = await ContactSupport.find(filter)
      .populate('userId', 'name email baroniId')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (err) {
    console.error('Error fetching all support tickets:', err);
    return res.status(500).json({
      success: false,
      message: 'Error fetching support tickets',
      error: err.message
    });
  }
};
