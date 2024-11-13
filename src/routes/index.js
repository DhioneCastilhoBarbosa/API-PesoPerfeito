const express = require('express');
const userController = require('../controllers/userController');
const ticketController = require('../controllers/ticketController');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Rotas de autenticação
router.post('/register', userController.register);
router.post('/login', userController.login);

// Rotas de tickets
router.post('/tickets', authenticate, ticketController.createTicket);
router.get('/tickets', authenticate, ticketController.getTickets);
router.put('/tickets/:ticketId', authenticate, ticketController.updateTicket);
router.delete('/tickets/:ticketId', authenticate, ticketController.deleteTicket);

module.exports = router;
