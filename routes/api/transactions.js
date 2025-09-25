import express from 'express';
import {
  createNewTransaction,
  createNewHybridTransaction,
  getUserTransactions,
  getTransaction,
  getUserBalance
} from '../../controllers/transaction.js';
import {
  createTransactionValidator,
  getTransactionValidator,
  getUserTransactionsValidator
} from '../../validators/transactionValidators.js';
import { requireAuth } from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Create a new hybrid transaction (coin + external payment)
router.post(
  '/hybrid',
  createTransactionValidator,
  createNewHybridTransaction
);

// Create a new transaction (legacy method)
router.post(
  '/',
  createTransactionValidator,
  createNewTransaction
);

// Get user's transaction history
router.get(
  '/history',
  getUserTransactionsValidator,
  getUserTransactions
);

// Get specific transaction by ID
router.get(
  '/:id',
  getTransactionValidator,
  getTransaction
);

// Get user's coin balance
router.get(
  '/balance',
  getUserBalance
);

export default router;










