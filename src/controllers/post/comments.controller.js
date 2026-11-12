import Comment from "../../models/comment.model.js";
import Post from "../../models/post.model.js";

export const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = await Comment.create({
      post: postId,
      author: req.user.id,
      content: content.trim(),
    });

    await comment.populate("author", "firstName lastName email avatar role");

    return res.status(201).json({
      message: "Comment added successfully",
      data: comment,
    });
  } catch (error) {
    console.error("addComment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const userId = req.user?.id?.toString();
    const isOwner = comment.author.toString() === userId;
    const isAdmin = req.user?.role === "admin";
    // The post's author can also remove comments on their own post.
    let isPostAuthor = false;
    if (!isOwner && !isAdmin) {
      const post = await Post.findById(comment.post).select("author").lean();
      isPostAuthor = !!post && post.author?.toString() === userId;
    }

    if (!isOwner && !isAdmin && !isPostAuthor) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    await Comment.deleteOne({ _id: commentId });

    return res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("deleteComment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
