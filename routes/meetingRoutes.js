const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');

router.post('/api/meetings/schedule', meetingController.scheduleMeeting);
router.get('/api/meetings/active', meetingController.getActiveMeetings);

module.exports = router;
