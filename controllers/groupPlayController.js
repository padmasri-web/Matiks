const GroupRoom = require('../models/GroupRoom');
const User = require('../models/Profile');
const Post = require('../models/Post');
const crypto = require('crypto');

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Clean uppercase alphanumeric (excluding confusing chars)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Render main Group Play hub dashboard page
exports.renderGroupPlayDashboard = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect('/auth');
    }

    const activeSessions = await GroupRoom.find({ status: { $in: ['waiting', 'in-session'] } })
      .populate('host', 'name username avatar')
      .populate('members.user', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    const errorMessage = req.query.error === 'full' ? 'That Group Lobby is already full (Max 4 Members).' : null;

    res.render('group-play/index', {
      user,
      activeSessions,
      errorMessage,
      activePage: 'group-play'
    });
  } catch (err) {
    console.error("Render Group Play error:", err);
    res.status(500).send("Server Error");
  }
};

// Create a new Group Lobby (Generates 6-character room code)
exports.createGroup = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required. Please log in." });
    }

    const { name, gameType } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Please enter a lobby name!" });
    }

    // Generate unique 6-character room code
    let roomCode = generateRoomCode();
    let existing = await GroupRoom.findOne({ roomCode });
    while (existing) {
      roomCode = generateRoomCode();
      existing = await GroupRoom.findOne({ roomCode });
    }

    const newGroup = await GroupRoom.create({
      roomCode,
      name: name.trim(),
      gameType: gameType || 'Sudoku',
      host: user._id,
      maxMembers: 4,
      members: [{
        user: user._id,
        name: user.name,
        username: user.username,
        avatar: user.avatar || '',
        isHost: true,
        isReady: true
      }],
      status: 'waiting'
    });

    // Auto-publish post on Community Feed
    try {
      const feedPost = await Post.create({
        author: user._id,
        content: `🎮 Created Group Play Lobby: "${newGroup.name}" for ${newGroup.gameType}! Join with Code: ${newGroup.roomCode} (Max 4 Players)`,
        category: 'Highlight'
      });

      const populatedPost = await Post.findById(feedPost._id).populate('author', 'name username avatar');
      const io = req.app.get('io');
      if (io) {
        io.emit('new_post_published', populatedPost);
      }
    } catch (postErr) {
      console.warn("Auto feed post error for group create:", postErr.message);
    }

    return res.json({ success: true, roomCode: newGroup.roomCode });
  } catch (err) {
    console.error("Create Group error:", err);
    return res.status(500).json({ success: false, message: "Server error creating group lobby." });
  }
};

// Join an existing Group Lobby using 6-character Code
exports.joinGroup = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required. Please log in." });
    }

    const { roomCode } = req.body;

    if (!roomCode || !roomCode.trim()) {
      return res.status(400).json({ success: false, message: "Please enter a Group Code!" });
    }

    const cleanCode = roomCode.trim().toUpperCase();
    const group = await GroupRoom.findOne({ roomCode: cleanCode });

    if (!group) {
      return res.status(404).json({ success: false, message: "Invalid Group Code! Room not found." });
    }

    if (group.status === 'completed') {
      return res.status(400).json({ success: false, message: "This group session has already completed." });
    }

    // STRICT 4-MEMBER CAPACITY ENFORCEMENT
    const isAlreadyMember = group.members.some(m => m.user.toString() === user._id.toString());
    if (!isAlreadyMember && group.members.length >= 4) {
      return res.status(400).json({
        success: false,
        message: "Group Lobby is Full! Maximum 4 members allowed per lobby."
      });
    }

    // Add user if not already in lobby
    if (!isAlreadyMember) {
      group.members.push({
        user: user._id,
        name: user.name,
        username: user.username,
        avatar: user.avatar || '',
        isHost: false,
        isReady: false
      });
      await group.save();

      // Emit real-time update to existing room sockets
      const io = req.app.get('io');
      if (io) {
        io.to(`group_lobby_${cleanCode}`).emit('group_lobby_updated', { roomCode: cleanCode, members: group.members });
      }
    }

    return res.json({ success: true, roomCode: group.roomCode });
  } catch (err) {
    console.error("Join Group error:", err);
    return res.status(500).json({ success: false, message: "Server error joining group lobby." });
  }
};

// Render specific Group Play live lobby room view (With Direct URL Auto-Join Logic)
exports.renderLobby = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect('/auth');
    }

    const { roomCode } = req.params;
    const cleanCode = roomCode.toUpperCase();

    let group = await GroupRoom.findOne({ roomCode: cleanCode })
      .populate('host', 'name username avatar')
      .populate('members.user', 'name username avatar');

    if (!group) {
      return res.redirect('/group-play');
    }

    // DIRECT URL JOINING & CAPACITY CHECK
    const isAlreadyMember = group.members.some(m => m.user._id.toString() === user._id.toString());

    if (!isAlreadyMember) {
      if (group.members.length >= 4) {
        return res.redirect('/group-play?error=full');
      }

      // Auto-join logged-in user navigating directly via URL
      group.members.push({
        user: user._id,
        name: user.name,
        username: user.username,
        avatar: user.avatar || '',
        isHost: false,
        isReady: false
      });
      await group.save();

      // Refresh populated document
      group = await GroupRoom.findOne({ roomCode: cleanCode })
        .populate('host', 'name username avatar')
        .populate('members.user', 'name username avatar');

      const io = req.app.get('io');
      if (io) {
        io.to(`group_lobby_${cleanCode}`).emit('group_lobby_updated', { roomCode: cleanCode, members: group.members });
      }
    }

    res.render('group-play/lobby', {
      user,
      group,
      activePage: 'group-play'
    });
  } catch (err) {
    console.error("Render Group Lobby error:", err);
    res.status(500).send("Server Error");
  }
};

// API: Get active sessions for top carousel stream
exports.getActiveSessions = async (req, res) => {
  try {
    const sessions = await GroupRoom.find({ status: { $in: ['waiting', 'in-session'] } })
      .populate('host', 'name username avatar')
      .populate('members.user', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({ success: true, sessions });
  } catch (err) {
    console.error("Get Active Sessions error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
