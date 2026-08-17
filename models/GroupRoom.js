const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: String,
  username: String,
  avatar: String,
  isHost: {
    type: Boolean,
    default: false
  },
  isReady: {
    type: Boolean,
    default: false
  },
  socketId: String,
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

const GroupRoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  gameType: {
    type: String,
    enum: ['Sudoku', '2048', 'Memory Math', 'Tic-Tac-Toe', 'Snake'],
    default: 'Sudoku'
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  maxMembers: {
    type: Number,
    default: 4,
    max: 4
  },
  members: [MemberSchema],
  status: {
    type: String,
    enum: ['waiting', 'in-session', 'completed'],
    default: 'waiting'
  },
  startTime: Date
}, { timestamps: true });

module.exports = mongoose.model('GroupRoom', GroupRoomSchema);
