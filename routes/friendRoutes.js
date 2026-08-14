const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friendController');

// Page Views
router.get('/friends/find', friendController.renderFindFriends);
router.get('/profile/user/:username', friendController.renderPublicProfile);

// API Endpoints
router.post('/api/friends/request', friendController.toggleFriendRequest);
router.post('/api/friends/accept', friendController.acceptFriendRequest);
router.get('/api/notifications/pending', friendController.getPendingNotifications);
router.get('/api/friends/accepted', friendController.getAcceptedFriends);

module.exports = router;
