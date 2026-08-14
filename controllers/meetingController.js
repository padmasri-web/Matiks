const Meeting = require('../models/Meeting');
const Post = require('../models/Post');
const User = require('../models/Profile');
const crypto = require('crypto');

exports.scheduleMeeting = async (req, res) => {
  try {
    const user = req.user || await User.findOne();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { title, scheduledTime } = req.body;
    if (!title || !scheduledTime) {
      return res.status(400).json({ error: "Meeting title and scheduled time are required" });
    }

    const roomId = 'room_' + crypto.randomBytes(6).toString('hex');
    const meetingDate = new Date(scheduledTime);

    const meeting = await Meeting.create({
      title: title.trim(),
      host: user._id,
      hostName: user.name,
      hostUsername: user.username,
      hostAvatarUrl: user.avatarUrl || null,
      scheduledTime: meetingDate,
      roomId,
      status: 'scheduled'
    });

    const formattedTime = meetingDate.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Auto-create Feed Post for Scheduled Meeting
    const postContent = `📅 Scheduled Video Meeting: "${meeting.title}"\n\n⏰ Scheduled Time: ${formattedTime}\n📹 Join Video Room ID: ${meeting.roomId}`;

    const post = await Post.create({
      author: user._id,
      authorName: user.name,
      authorUsername: user.username,
      authorAvatarUrl: user.avatarUrl || null,
      content: postContent,
      category: 'Meeting',
      image: null,
      likes: [],
      comments: []
    });

    const populatedPost = {
      _id: post._id,
      author: {
        _id: user._id,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl
      },
      authorName: user.name,
      authorUsername: user.username,
      authorAvatarUrl: user.avatarUrl,
      content: post.content,
      category: 'Meeting',
      likesCount: 0,
      isLiked: false,
      createdAt: post.createdAt,
      roomId: meeting.roomId
    };

    // Broadcast new meeting post globally to all connected users
    const io = req.app.get('io');
    if (io) {
      io.emit('new_post_published', populatedPost);
      io.emit('meeting_created', meeting);
    }

    return res.json({ success: true, meeting, post: populatedPost });
  } catch (err) {
    console.error("Error in scheduleMeeting:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getActiveMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      status: { $in: ['scheduled', 'live'] }
    })
    .sort({ scheduledTime: 1 })
    .limit(10)
    .lean();

    return res.json(meetings);
  } catch (err) {
    console.error("Error in getActiveMeetings:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
