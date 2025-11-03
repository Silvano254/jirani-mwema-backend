const express = require('express');
const router = express.Router();

// Import controllers
const transactionController = require('../src/controllers/transactionController');
const authMiddleware = require('../src/middleware/authMiddleware');

// Get all contributions
router.get('/', authMiddleware.authenticate, transactionController.getContributions);

// Add contribution
router.post('/', authMiddleware.authenticate, authMiddleware.requireAdmin, transactionController.createContribution);

// Get contribution by ID
router.get('/:id', authMiddleware.authenticate, transactionController.getTransactionById);

// Update contribution
router.put('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, transactionController.updateTransaction);

// Delete contribution
router.delete('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, transactionController.deleteTransaction);

module.exports = router;