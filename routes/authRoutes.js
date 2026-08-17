const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/Profile');
const crypto = require('crypto');

// Render Auth / Landing Page (Redirects to dashboard if already authenticated)
router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('auth/landing');
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    if (!user) {
      return res.status(400).json({ success: false, message: info.message || 'Invalid credentials' });
    }
    req.logIn(user, (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Login execution failed' });
      }
      return res.json({ success: true, user });
    });
  })(req, res, next);
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ success: false, message: 'Please fill in all fields' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username is already taken' });
    }

    // Hash the password
    const passwordHash = crypto.pbkdf2Sync(password, 'salt', 1000, 64, 'sha512').toString('hex');

    // Create user with default stats matching the mockup profile defaults!
    const newUser = await User.create({
      name,
      username,
      password: passwordHash,
      coins: 500,
      drops: 0,
      xp: 0,
      rankRating: 0,
      badgeTier: 'NOVICE',
      ratings: {
        math: 0,
        logic: 0,
        memory: 0,
        puzzle: 0
      },
      onlineFriends: [
        { name: 'YOU', avatar: name.charAt(0).toUpperCase(), status: 'online', color: '#4564C6' },
        { name: 'SIDDNT', avatar: '', status: 'online', color: '#F42F76' },
        { name: 'CHANAKY...', avatar: '', status: 'online', color: '#50D1E0' }
      ],
      quests: [
        { title: "Complete today's Puzzle - Sudoku Challenge", category: "Puzzle", currentProgress: 0, targetProgress: 1, completed: false }
      ]
    });

    req.logIn(newUser, (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Registration login failed' });
      }
      return res.json({ success: true, user: newUser });
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: 'Server registration failed' });
  }
});

// Logout route (destroys session and clears cookies)
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.redirect('/auth');
    });
  });
});

module.exports = router;
