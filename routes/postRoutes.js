const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

// Feed Page View
router.get('/feed', postController.renderFeed);

// API Endpoints
router.get('/api/posts', postController.getPosts);
router.post('/api/posts', postController.createPost);
router.post('/api/posts/:id/like', postController.toggleLikePost);

module.exports = router;
