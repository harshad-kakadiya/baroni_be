import { validationResult } from 'express-validator';
import { 
  createTransaction, 
  createHybridTransaction,
  getUserTransactionHistory, 
  getTransactionById, 
  getUserCoinBalance 
} from '../services/transactionService.js';

// Create a new hybrid transaction (coin + external payment)
export const createNewHybridTransaction = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { type, receiverId, amount, description, metadata, userPhone, starName } = req.body;
    const payerId = req.user.id;

    // Validate receiver is not the same as payer
    if (payerId === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Payer and receiver cannot be the same'
      });
    }

    // Validate required fields for hybrid transaction
    if (!userPhone) {
      return res.status(400).json({
        success: false,
        message: 'User phone number is required for hybrid transactions'
      });
    }

    const transactionData = {
      type,
      payerId,
      receiverId,
      amount,
      description,
      metadata,
      userPhone,
      starName
    };

    const result = await createHybridTransaction(transactionData);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    console.error('Error creating hybrid transaction:', err);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Error creating hybrid transaction'
    });
  }
};

// Create a new transaction (legacy method)
export const createNewTransaction = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { type, receiverId, amount, description, paymentMode, metadata } = req.body;
    const payerId = req.user.id;

    // Validate receiver is not the same as payer
    if (payerId === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Payer and receiver cannot be the same'
      });
    }

    const transactionData = {
      type,
      payerId,
      receiverId,
      amount,
      description,
      paymentMode,
      metadata
    };

    const result = await createTransaction(transactionData);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    console.error('Error creating transaction:', err);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Error creating transaction'
    });
  }
};

// Get user's transaction history
export const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, paymentMode } = req.query;

    const transactions = await getUserTransactionHistory(userId, {
      type,
      paymentMode
    });

    return res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (err) {
    console.error('Error fetching user transactions:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching transaction history',
      error: err.message 
    });
  }
};

// Get specific transaction by ID
export const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const transaction = await getTransactionById(id);

    // Check if user is involved in this transaction
    if (transaction.payerId._id.toString() !== userId && 
        transaction.receiverId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (err) {
    console.error('Error fetching transaction:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching transaction',
      error: err.message 
    });
  }
};

// Get user's coin balance
export const getUserBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const balance = await getUserCoinBalance(userId);

    return res.status(200).json({
      success: true,
      data: { balance }
    });
  } catch (err) {
    console.error('Error fetching user balance:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching user balance',
      error: err.message 
    });
  }
};
