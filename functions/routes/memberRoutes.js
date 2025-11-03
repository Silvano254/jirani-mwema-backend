const express = require('express');
const router = express.Router();

// Import controllers
const userController = require('../src/controllers/userController');
const authMiddleware = require('../src/middleware/authMiddleware');

// Get all members
router.get('/', authMiddleware.authenticate, authMiddleware.requireAdmin, userController.getAllUsers);

// Get member by ID
router.get('/:id', authMiddleware.authenticate, userController.getUserById);

// Update member
router.put('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, userController.updateUser);

// Delete member
router.delete('/:id', authMiddleware.authenticate, authMiddleware.requireAdmin, userController.deleteUser);

// Get member contributions
router.get('/:id/contributions', authMiddleware.authenticate, (req, res) => {
  // This will be implemented in contributionRoutes
  res.status(501).json({ success: false, message: 'Not implemented yet' });
});

module.exports = router;