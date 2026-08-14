const User = require('../models/Profile');
const Friend = require('../models/Friend');
const { GameLog } = require('../models/Challenge');

exports.renderFindFriends = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.redirect('/auth');

    const search = req.query.search ? req.query.search.trim() : '';
    let query = { _id: { $ne: currentUser._id } };

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const allUsers = await User.find(query).lean();

    // Fetch all friend relationships involving currentUser
    const relationships = await Friend.find({
      $or: [
        { requester: currentUser._id },
        { recipient: currentUser._id }
      ]
    }).lean();

    // Map relationship state to each user
    const usersWithStatus = allUsers.map(u => {
      const rel = relationships.find(r => 
        (r.requester.toString() === currentUser._id.toString() && r.recipient.toString() === u._id.toString()) ||
        (r.recipient.toString() === currentUser._id.toString() && r.requester.toString() === u._id.toString())
      );

      let friendStatus = 'none';
      if (rel) {
        if (rel.status === 'accepted') {
          friendStatus = 'friends';
        } else if (rel.status === 'pending') {
          if (rel.requester.toString() === currentUser._id.toString()) {
            friendStatus = 'pending_sent';
          } else {
            friendStatus = 'pending_received';
          }
        }
      }

      return {
        ...u,
        friendStatus
      };
    });

    res.render('friends/find', {
      user: currentUser,
      suggestedUsers: usersWithStatus,
      searchQuery: search,
      page: 'find-friends'
    });
  } catch (err) {
    console.error("Error in renderFindFriends:", err);
    res.status(500).send("Server Error");
  }
};

exports.renderPublicProfile = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.redirect('/auth');

    const targetUsername = req.params.username;
    const targetUser = await User.findOne({ username: targetUsername }).lean();

    if (!targetUser) {
      return res.status(404).send("User not found");
    }

    // If viewing own profile, redirect to main /profile page
    if (targetUser._id.toString() === currentUser._id.toString()) {
      return res.redirect('/profile');
    }

    // Fetch friend status between currentUser and targetUser
    const rel = await Friend.findOne({
      $or: [
        { requester: currentUser._id, recipient: targetUser._id },
        { requester: targetUser._id, recipient: currentUser._id }
      ]
    }).lean();

    let friendStatus = 'none';
    if (rel) {
      if (rel.status === 'accepted') {
        friendStatus = 'friends';
      } else if (rel.status === 'pending') {
        if (rel.requester.toString() === currentUser._id.toString()) {
          friendStatus = 'pending_sent';
        } else {
          friendStatus = 'pending_received';
        }
      }
    }

    // Count target user's accepted friends
    const friendsCount = await Friend.countDocuments({
      $or: [
        { requester: targetUser._id, status: 'accepted' },
        { recipient: targetUser._id, status: 'accepted' }
      ]
    });

    // Calculate Head-to-Head stats (Wins / Ties / Losses)
    const logs = await GameLog.find({
      user: currentUser._id,
      opponentName: targetUser.username
    }).lean();

    let wins = 0, ties = 0, losses = 0;
    logs.forEach(log => {
      if (log.playerScore > log.opponentScore) wins++;
      else if (log.playerScore === log.opponentScore) ties++;
      else losses++;
    });

    res.render('publicProfile', {
      currentUser,
      user: targetUser,
      friendStatus,
      friendsCount,
      headToHead: { wins, ties, losses }
    });
  } catch (err) {
    console.error("Error in renderPublicProfile:", err);
    res.status(500).send("Server Error");
  }
};

exports.toggleFriendRequest = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: "Target user ID required" });

    const existingRel = await Friend.findOne({
      $or: [
        { requester: currentUser._id, recipient: targetUserId },
        { requester: targetUserId, recipient: currentUser._id }
      ]
    });

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');

    if (!existingRel) {
      // Create new pending friend request
      await Friend.create({
        requester: currentUser._id,
        recipient: targetUserId,
        status: 'pending'
      });

      // Emit real-time WebSocket notification to target user if connected
      if (io && userSockets) {
        const targetSocketId = userSockets.get(targetUserId.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('friend_request_received', {
            requesterId: currentUser._id.toString(),
            requesterName: currentUser.name,
            requesterUsername: currentUser.username,
            avatarUrl: currentUser.avatarUrl
          });
        }
      }

      return res.json({ status: 'pending_sent', message: 'Friend request sent' });
    }

    if (existingRel.status === 'pending') {
      if (existingRel.requester.toString() === currentUser._id.toString()) {
        // Withdraw pending request
        await Friend.deleteOne({ _id: existingRel._id });

        if (io && userSockets) {
          const targetSocketId = userSockets.get(targetUserId.toString());
          if (targetSocketId) {
            io.to(targetSocketId).emit('friend_request_withdrawn', {
              requesterId: currentUser._id.toString()
            });
          }
        }

        return res.json({ status: 'none', message: 'Friend request withdrawn' });
      }
    }

    if (existingRel.status === 'accepted') {
      // Remove friend
      await Friend.deleteOne({ _id: existingRel._id });
      return res.json({ status: 'none', message: 'Friend removed' });
    }

    return res.json({ status: existingRel.status });
  } catch (err) {
    console.error("Error in toggleFriendRequest:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    const { requesterId } = req.body;
    const rel = await Friend.findOneAndUpdate(
      { requester: requesterId, recipient: currentUser._id, status: 'pending' },
      { status: 'accepted' },
      { new: true }
    );

    if (rel) {
      const io = req.app.get('io');
      const userSockets = req.app.get('userSockets');
      if (io && userSockets) {
        const requesterSocketId = userSockets.get(requesterId.toString());
        if (requesterSocketId) {
          io.to(requesterSocketId).emit('friend_request_accepted', {
            recipientId: currentUser._id.toString(),
            recipientName: currentUser.name,
            recipientUsername: currentUser.username
          });
        }
      }

      return res.json({ status: 'friends', message: 'Friend request accepted' });
    } else {
      return res.status(400).json({ error: 'No pending request found' });
    }
  } catch (err) {
    console.error("Error in acceptFriendRequest:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getPendingNotifications = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    const pendingRequests = await Friend.find({
      recipient: currentUser._id,
      status: 'pending'
    }).populate('requester', 'username name avatarUrl').lean();

    const notifications = pendingRequests.map(r => ({
      id: r._id,
      requesterId: r.requester ? r.requester._id.toString() : '',
      requesterUsername: r.requester ? r.requester.username : 'User',
      requesterName: r.requester ? r.requester.name : 'User',
      avatarUrl: r.requester ? r.requester.avatarUrl : null,
      createdAt: r.createdAt
    }));

    return res.json(notifications);
  } catch (err) {
    console.error("Error in getPendingNotifications:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getAcceptedFriends = async (req, res) => {
  try {
    const currentUser = req.user || await User.findOne();
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    const friendships = await Friend.find({
      $or: [
        { requester: currentUser._id, status: 'accepted' },
        { recipient: currentUser._id, status: 'accepted' }
      ]
    })
    .populate('requester', 'username name avatarUrl')
    .populate('recipient', 'username name avatarUrl')
    .lean();

    const friends = friendships.map(f => {
      const isReq = f.requester._id.toString() === currentUser._id.toString();
      const friendObj = isReq ? f.recipient : f.requester;
      return {
        _id: friendObj._id.toString(),
        name: friendObj.name,
        username: friendObj.username,
        avatarUrl: friendObj.avatarUrl
      };
    });

    return res.json(friends);
  } catch (err) {
    console.error("Error in getAcceptedFriends:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
