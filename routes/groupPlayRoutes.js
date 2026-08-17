const express = require('express');
const router = express.Router();
const groupPlayController = require('../controllers/groupPlayController');

// Main Group Play Hub Dashboard Page
router.get('/', groupPlayController.renderGroupPlayDashboard);

// API Endpoints for Group Play
router.post('/api/create', groupPlayController.createGroup);
router.post('/api/join', groupPlayController.joinGroup);
router.get('/api/active-sessions', groupPlayController.getActiveSessions);

// Live Group Play Lobby Page
router.get('/lobby/:roomCode', groupPlayController.renderLobby);

module.exports = router;
