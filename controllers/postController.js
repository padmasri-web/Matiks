const Post = require('../models/Post');
const User = require('../models/Profile');

exports.renderFeed = async (req, res) => {
  try {
    const user = req.user || await User.findOne();
    if (!user) return res.redirect('/auth');

    const posts = await Post.find()
      .populate('author', 'name username avatarUrl')
      .sort({ createdAt: -1 })
      .lean();

    const formattedPosts = posts.map(p => ({
      ...p,
      likesCount: p.likes ? p.likes.length : 0,
      isLiked: p.likes ? p.likes.some(id => id.toString() === user._id.toString()) : false
    }));

    res.render('feed/index', {
      user,
      posts: formattedPosts,
      page: 'feed'
    });
  } catch (err) {
    console.error("Error in renderFeed:", err);
    res.status(500).send("Server Error");
  }
};

exports.getPosts = async (req, res) => {
  try {
    const user = req.user || await User.findOne();
    const posts = await Post.find()
      .populate('author', 'name username avatarUrl')
      .sort({ createdAt: -1 })
      .lean();

    const formattedPosts = posts.map(p => ({
      ...p,
      likesCount: p.likes ? p.likes.length : 0,
      isLiked: user && p.likes ? p.likes.some(id => id.toString() === user._id.toString()) : false
    }));

    res.json(formattedPosts);
  } catch (err) {
    console.error("Error in getPosts:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.createPost = async (req, res) => {
  try {
    const user = req.user || await User.findOne();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { content, image, category } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: "Post content cannot be empty" });
    }

    const post = await Post.create({
      author: user._id,
      authorName: user.name,
      authorUsername: user.username,
      authorAvatarUrl: user.avatarUrl || null,
      content: content.trim(),
      image: image ? image.trim() : null,
      category: category || 'General',
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
      image: post.image,
      category: post.category,
      likesCount: 0,
      isLiked: false,
      createdAt: post.createdAt
    };

    // Broadcast new post to ALL connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('new_post_published', populatedPost);
    }

    return res.json({ success: true, post: populatedPost });
  } catch (err) {
    console.error("Error in createPost:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.toggleLikePost = async (req, res) => {
  try {
    const user = req.user || await User.findOne();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const uIdStr = user._id.toString();
    const likeIndex = post.likes.findIndex(id => id.toString() === uIdStr);

    let isLiked = false;
    if (likeIndex > -1) {
      // Remove like
      post.likes.splice(likeIndex, 1);
      isLiked = false;
    } else {
      // Add like
      post.likes.push(user._id);
      isLiked = true;
    }

    await post.save();

    const likesCount = post.likes.length;

    // Broadcast like update to ALL connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('post_liked_update', {
        postId: post._id.toString(),
        likesCount,
        userId: uIdStr,
        isLiked
      });
    }

    return res.json({ success: true, isLiked, likesCount });
  } catch (err) {
    console.error("Error in toggleLikePost:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
