require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const gameRoutes = require('./routes/gameRoutes');
const memoryMathRoutes = require('./routes/MemoryMathRoutes');
const snakeGameRoutes = require('./routes/snakeGameRoutes');
const authRoutes = require('./routes/authRoutes');
const friendRoutes = require('./routes/friendRoutes');
const ticTacToeRoutes = require('./routes/tic-tac-toe_Routes');
const postRoutes = require('./routes/postRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

// Import models for seeding
const User = require('./models/Profile');
const { Challenge, GameLog } = require('./models/Challenge');
const Friend = require('./models/Friend');

// Import utilities
const { initDailyChallengeCron } = require('./utils/cronJobs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

// Socket.IO User Presence & Real-Time Event Handlers
const userSockets = new Map();
app.set('userSockets', userSockets);

io.on('connection', (socket) => {
  socket.on('join_user_room', (userId) => {
    if (userId) {
      const uIdStr = userId.toString();
      userSockets.set(uIdStr, socket.id);
      socket.userId = uIdStr;
      socket.join(`user_${uIdStr}`);
      console.log(`⚡ WebSocket: User ${uIdStr} connected & joined room user_${uIdStr}`);
    }
  });

  socket.on('send_friend_request', (data) => {
    if (data && data.targetUserId) {
      const targetSocketId = userSockets.get(data.targetUserId.toString());
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend_request_received', data);
      }
    }
  });

  socket.on('accept_friend_request', (data) => {
    if (data && data.requesterId) {
      const requesterSocketId = userSockets.get(data.requesterId.toString());
      if (requesterSocketId) {
        io.to(requesterSocketId).emit('friend_request_accepted', data);
      }
    }
  });

  // WebRTC 1-on-1 & In-Game Calling Signaling Handlers
  socket.on('call_user', (data) => {
    if (data) {
      const targetSocketId = data.targetSocketId || (data.targetUserId ? userSockets.get(data.targetUserId.toString()) : null);
      if (targetSocketId) {
        io.to(targetSocketId).emit('incoming_call', {
          callerId: data.callerId || socket.userId,
          callerName: data.callerName || 'Friend',
          callerUsername: data.callerUsername || 'player',
          callType: data.callType || 'video',
          offer: data.offer,
          socketId: socket.id
        });
      } else if (data.callerId) {
        // Target user is offline
        socket.emit('call_failed', { message: 'Target user is currently offline or not connected.' });
      }
    }
  });

  socket.on('answer_call', (data) => {
    if (data) {
      const callerSocketId = data.targetSocketId || (data.callerId ? userSockets.get(data.callerId.toString()) : null);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_accepted', {
          answer: data.answer,
          responderSocketId: socket.id,
          responderUserId: socket.userId
        });
      }
    }
  });

  socket.on('ice_candidate', (data) => {
    if (data && data.candidate) {
      const targetSocketId = data.targetSocketId || (data.targetUserId ? userSockets.get(data.targetUserId.toString()) : null);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice_candidate', {
          candidate: data.candidate,
          fromSocketId: socket.id,
          fromUserId: socket.userId
        });
      }
    }
  });

  socket.on('end_call', (data) => {
    if (data) {
      const targetSocketId = data.targetSocketId || (data.targetUserId ? userSockets.get(data.targetUserId.toString()) : null);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call_ended', { fromSocketId: socket.id });
      }
    }
  });

  // WebRTC Multi-Peer Group Video Room Handlers
  socket.on('join_video_room', (data) => {
    // data: { roomId, userId, userName, userUsername }
    if (data && data.roomId) {
      const roomName = `meeting_${data.roomId}`;
      socket.join(roomName);
      socket.currentRoom = roomName;
      socket.roomId = data.roomId;

      // Get existing sockets in this room
      const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
      const otherSockets = roomSockets.filter(id => id !== socket.id);

      // Send existing peers ONLY to the newly joined peer
      socket.emit('room_peers', { peers: otherSockets });

      // Notify existing room peers of the new participant
      socket.to(roomName).emit('user_joined_room', {
        socketId: socket.id,
        userId: data.userId,
        userName: data.userName,
        userUsername: data.userUsername
      });

      // Broadcast room participant count update globally
      io.emit('room_participants_updated', {
        roomId: data.roomId,
        count: roomSockets.length
      });
    }
  });

  socket.on('room_offer', (data) => {
    // data: { targetSocketId, offer }
    if (data && data.targetSocketId) {
      io.to(data.targetSocketId).emit('room_offer', {
        callerSocketId: socket.id,
        offer: data.offer
      });
    }
  });

  socket.on('room_answer', (data) => {
    // data: { targetSocketId, answer }
    if (data && data.targetSocketId) {
      io.to(data.targetSocketId).emit('room_answer', {
        responderSocketId: socket.id,
        answer: data.answer
      });
    }
  });

  socket.on('leave_video_room', (data) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('user_left_room', { socketId: socket.id });
      socket.leave(socket.currentRoom);

      if (socket.roomId) {
        const roomSockets = Array.from(io.sockets.adapter.rooms.get(socket.currentRoom) || []);
        io.emit('room_participants_updated', {
          roomId: socket.roomId,
          count: roomSockets.length
        });
      }

      socket.currentRoom = null;
      socket.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      console.log(`⚡ WebSocket: User ${socket.userId} disconnected`);
    }

    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('user_left_room', { socketId: socket.id });
      if (socket.roomId) {
        const roomSockets = Array.from(io.sockets.adapter.rooms.get(socket.currentRoom) || []);
        io.emit('room_participants_updated', {
          roomId: socket.roomId,
          count: roomSockets.length
        });
      }
    }
  });
});

const PORT = process.env.PORT || 6700;

// Connect to MongoDB
connectDB();

// Database Seeder function
const seedData = async () => {
  try {
    // Only seed if MongoDB connection is open and active
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected; skipping database seeding. App will run in memory fallback mode.');
      return;
    }

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const crypto = require('crypto');
      const seedPasswordHash = crypto.pbkdf2Sync('password', 'salt', 1000, 64, 'sha512').toString('hex');

      await User.create({
        name: 'Jhalak Yadav',
        username: 'jhalak_yadav',
        password: seedPasswordHash,
        coins: 500,
        drops: 0,
        xp: 0,
        onlineFriends: [
          { name: 'YOU', avatar: 'J', status: 'online', color: '#4564C6' },
          { name: 'SIDDNT', avatar: '', status: 'online', color: '#F42F76' },
          { name: 'CHANAKY...', avatar: '', status: 'online', color: '#50D1E0' },
          { name: 'DIVYASAI...', avatar: '', status: 'online', color: '#F58DB4' },
          { name: 'KRISHHH7...', avatar: '', status: 'idle', color: '#B8F3FA' },
          { name: 'ADARSH9...', avatar: '', status: 'idle', color: '#52516E' },
          { name: 'PSEUDOC...', avatar: 'P', status: 'online', color: '#50D1E0' }
        ],
        quests: [
          { title: "Complete today's Puzzle - Sudoku Challenge", category: "Puzzle", currentProgress: 0, targetProgress: 1, completed: false },
          { title: "Play 1 Math - Sprint Duel", category: "Math", currentProgress: 1, targetProgress: 1, completed: true },
          { title: "Play 1 Memory - Mind Snap Duel", category: "Memory", currentProgress: 1, targetProgress: 1, completed: true }
        ]
      });
      console.log('Seeded database with default User statistics.');
    }

    const challengeCount = await Challenge.countDocuments();
    if (challengeCount === 0) {
      await Challenge.create([
        {
          title: "Sprint Duels",
          category: "Math",
          mode: "Sprint Duels",
          description: "RACE TO SOLVE THE MOST IN 1 MINUTE",
          badgeColor: "#F42F76",
          points: 100
        },
        {
          title: "Fast & First",
          category: "Math",
          mode: "Fast & First",
          description: "BE THE FIRST TO ANSWER EACH QUESTION",
          badgeColor: "#4564C6",
          points: 120
        }
      ]);
    }

    const gameLogCount = await GameLog.countDocuments();
    if (gameLogCount === 0) {
      const user = await User.findOne();
      const challenge = await Challenge.findOne({ mode: "Sprint Duels" });
      if (user && challenge) {
        await GameLog.create([
          {
            user: user._id,
            challenge: challenge._id,
            category: "Math",
            mode: "Sprint Duels",
            playerScore: 11,
            playerRatingChange: 3,
            opponentName: "adiityabaliyan864",
            opponentScore: 10,
            opponentRatingChange: -3,
            playedAt: new Date("2026-07-14T20:09:00Z")
          }
        ]);
        console.log('Seeded database with default game history logs.');
      }
    }
  } catch (error) {
    console.error('Seeding database failed:', error.message);
  }
};

// Execute seeding and start Daily Challenge Cron Job after connection is established
setTimeout(() => {
  seedData();
  initDailyChallengeCron();
}, 2000);

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Express Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'mathlete-super-secret-key-9779',
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport and Session support
app.use(passport.initialize());
app.use(passport.session());

// Passport Strategy Configuration
passport.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password'
}, async (username, password, done) => {
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return done(null, false, { message: 'Incorrect username.' });
    }
    if (!user.validPassword(password)) {
      return done(null, false, { message: 'Incorrect password.' });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Serve frontend static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Session Locals Middleware
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// Authentication Check Middlewares
const ensureAuthenticated = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth');
};

const ensureGuest = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
};

// Register Auth Routes (Guest Landing)
app.use('/auth', authRoutes);

// Unauthenticated /auth redirect check
app.get('/auth', ensureGuest, (req, res) => {
  res.render('auth/landing');
});

// Protected API Routes
app.use('/api/user', ensureAuthenticated, userRoutes);
app.use('/api/challenges', ensureAuthenticated, challengeRoutes);

// Protected Game & Friend Routes
app.use('/', ensureAuthenticated, gameRoutes);
app.use('/', ensureAuthenticated, friendRoutes);
app.use('/', ensureAuthenticated, postRoutes);
app.use('/', ensureAuthenticated, meetingRoutes);

// Protected Dashboard Arena Page Route
app.get('/', ensureAuthenticated, (req, res) => {
  res.render('index');
});

// Protected User Profile Page Route
app.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect('/auth');
    }

    const lastChallenge = await Challenge.findOne({ mode: "Sprint Duels" }) || { title: "Sprint Duels", category: "Math" };
    const gameLogs = await GameLog.find({ user: user._id })
      .populate('challenge')
      .sort({ playedAt: -1 })
      .limit(2);

    const friendsCount = await Friend.countDocuments({
      $or: [
        { requester: user._id, status: 'accepted' },
        { recipient: user._id, status: 'accepted' }
      ]
    });

    res.render('profile', { user, lastChallenge, gameLogs, friendsCount });
  } catch (err) {
    console.warn("Failed to retrieve profile data from MongoDB:", err);
    res.redirect('/auth');
  }
});

// Protected Match History Route
app.get('/profile/history', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect('/auth');
    }
    const gameLogs = await GameLog.find({ user: user._id }).populate('challenge').sort({ playedAt: -1 });
    res.render('history', { user, gameLogs });
  } catch (err) {
    console.warn("Failed to retrieve match history:", err);
    res.redirect('/auth');
  }
});

// Protected Individual Game Page Routes
app.get('/games/lightsout', ensureAuthenticated, (req, res) => {
  res.render('games/lightsOut');
});

app.get('/games/sudoku', ensureAuthenticated, (req, res) => {
  res.render('games/sudoku');
});

app.get('/games/crossmath', ensureAuthenticated, (req, res) => {
  res.render('games/crossMath');
});

app.get('/games/logic', ensureAuthenticated, (req, res) => {
  res.render('games/logicGames');
});

app.use('/games/memorymath', ensureAuthenticated, memoryMathRoutes);
app.use('/', ensureAuthenticated, snakeGameRoutes);
app.use('/', ensureAuthenticated, ticTacToeRoutes);

// Fallback route (redirects to protected home which enforces login)
app.get('/{*splat}', (req, res) => {
  res.redirect('/');
});

// Start listening
server.listen(PORT, () => {
  console.log(`🚀 Matiks Server listening on port ${PORT}`);
});
