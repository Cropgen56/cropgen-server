import Post from "../../models/post.model.js";
import Comment from "../../models/comment.model.js";
import mongoose from "mongoose";
import { createPostImagePresignedUrl } from "../../utils/storage/s3.js";

export const createPost = async (req, res) => {
  try {
    const { content, images, tags } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const post = await Post.create({
      author: req.user.id,
      content: content.trim(),
      images: images || [],
      tags: tags || [],
    });

    await post.populate("author", "name avatar");

    return res.status(201).json({
      message: "Post created successfully",
      data: post,
    });
  } catch (error) {
    console.error("createPost error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const skip = (page - 1) * limit;

    const posts = await Post.aggregate([
      // Sort newest first
      { $sort: { createdAt: -1 } },

      // Pagination
      { $skip: skip },
      { $limit: limit },

      // Populate post author
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "author",
        },
      },
      { $unwind: "$author" },

      // Remove sensitive fields from author
      {
        $project: {
          "author.otp": 0,
          "author.otpExpires": 0,
          "author.otpAttemptCount": 0,
          "author.lastOtpSentAt": 0,
          "author.refreshTokenId": 0,
          "author.firebaseUid": 0,
          "author.__v": 0,
        },
      },

      // Fetch comments for each post
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "post",
          as: "comments",
          pipeline: [
            { $sort: { createdAt: -1 } },

            // Populate comment author
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
              },
            },
            { $unwind: "$author" },

            // Remove sensitive user fields
            {
              $project: {
                content: 1,
                createdAt: 1,
                "author._id": 1,
                "author.firstName": 1,
                "author.lastName": 1,
                "author.avatar": 1,
                "author.role": 1,
              },
            },
          ],
        },
      },

      // Add comment count
      {
        $addFields: {
          commentCount: { $size: "$comments" },
          likeCount: { $size: "$likes" },
        },
      },
    ]);

    const total = await Post.countDocuments();

    return res.status(200).json({
      data: posts,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + posts.length < total,
      },
    });
  } catch (error) {
    console.error("getPosts error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }

    const posts = await Post.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(postId) },
      },

      // Populate post author
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "author",
        },
      },
      { $unwind: "$author" },

      // Remove sensitive author fields
      {
        $project: {
          "author.otp": 0,
          "author.otpExpires": 0,
          "author.otpAttemptCount": 0,
          "author.lastOtpSentAt": 0,
          "author.refreshTokenId": 0,
          "author.firebaseUid": 0,
          "author.__v": 0,
        },
      },

      // Fetch comments for this post
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "post",
          as: "comments",
          pipeline: [
            { $sort: { createdAt: 1 } },

            // Populate comment author
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
              },
            },
            { $unwind: "$author" },

            // Clean author data
            {
              $project: {
                content: 1,
                createdAt: 1,
                "author._id": 1,
                "author.firstName": 1,
                "author.lastName": 1,
                "author.avatar": 1,
                "author.role": 1,
              },
            },
          ],
        },
      },

      // Counts
      {
        $addFields: {
          commentCount: { $size: "$comments" },
          likeCount: { $size: "$likes" },
        },
      },
    ]);

    if (!posts.length) {
      return res.status(404).json({ message: "Post not found" });
    }

    return res.status(200).json({
      data: posts[0],
    });
  } catch (error) {
    console.error("getPostById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Validate ObjectId first → avoids CastError
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    // 2. Make sure auth middleware set req.user
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // ❗ Adjust this field name based on your schema
    // If your Post schema uses createdBy / userId / user instead of author, change it here.
    const ownerId = post.author || post.createdBy || post.userId || post.user;

    if (!ownerId) {
      // Fallback if the document really has no owner field
      return res
        .status(500)
        .json({ message: "Post has no owner field (check schema)" });
    }

    const isOwner = ownerId.toString() === req.user.id?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this post" });
    }

    // Delete post
    await Post.deleteOne({ _id: postId });

    // Optionally delete comments related to this post
    await Comment.deleteMany({ post: postId });

    return res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("deletePost error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;

    // 1. Validate postId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    // 2. Get user id from auth (IMPORTANT)
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: user not found in request" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // 3. Clean any null/undefined from existing likes
    post.likes = (post.likes || []).filter((id) => !!id);

    const userIdStr = userId.toString();

    const alreadyLiked = post.likes.some((id) => id.toString() === userIdStr);

    if (alreadyLiked) {
      // unlike
      post.likes = post.likes.filter((id) => id.toString() !== userIdStr);
    } else {
      // like
      post.likes.push(userId);
    }

    await post.save();

    return res.status(200).json({
      message: "Like status updated",
      data: {
        liked: !alreadyLiked,
        likesCount: post.likes.length,
      },
    });
  } catch (error) {
    console.error("toggleLike error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getPostImageUploadUrl = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { fileType } = req.body;

    if (!fileType || !fileType.startsWith("image/")) {
      return res
        .status(400)
        .json({ message: "Valid image content type is required" });
    }

    const { uploadUrl, fileUrl } = await createPostImagePresignedUrl({
      userId,
      fileType,
    });

    return res.status(200).json({
      message: "Post image upload URL generated",
      data: {
        uploadUrl,
        fileUrl,
      },
    });
  } catch (error) {
    console.error("getPostImageUploadUrl error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
