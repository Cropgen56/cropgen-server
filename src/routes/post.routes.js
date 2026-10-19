import express from "express";
import {
  createPost,
  getPosts,
  getPostById,
  deletePost,
  toggleLike,
  getPostImageUploadUrl,
} from "../controllers/post/post.controller.js";

import {
  addComment,
  deleteComment,
} from "../controllers/post/comments.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";

const router = express.Router();

// create posts route
router.post("/", isAuthenticated, createPost);
router.get("/", isAuthenticated, getPosts);
router.get("/:postId", isAuthenticated, getPostById);
router.delete("/:postId", isAuthenticated, deletePost);
router.post("/:postId/like", isAuthenticated, toggleLike);

// post comments routes
router.post("/:postId/comments", isAuthenticated, addComment);
router.delete("/comments/:commentId", isAuthenticated, deleteComment);
router.post("/post-presign", isAuthenticated, getPostImageUploadUrl);

export default router;
