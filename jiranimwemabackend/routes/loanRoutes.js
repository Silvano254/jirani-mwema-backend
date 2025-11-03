const express = require('express');
const router = express.Router();

// Import controllers
const transactionController = require('../src/controllers/transactionController');
const authMiddleware = require('../src/middleware/authMiddleware');

// Get all loans
router.get('/', authMiddleware.authenticate, transactionController.getLoans);

// Apply for loan
router.post('/', authMiddleware.authenticate, transactionController.createLoan);

// Get loan by ID
router.get('/:id', authMiddleware.authenticate, transactionController.getTransactionById);

// Update loan (approve/reject)
router.put('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, transactionController.updateTransaction);

// Delete loan
router.delete('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, transactionController.deleteTransaction);

module.exports = router;