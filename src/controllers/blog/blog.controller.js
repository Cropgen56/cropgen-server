import Blog from "../../models/blog.model.js";

// Create a new blog post
export const createBlog = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res
        .status(400)
        .json({ message: "Title and content are required" });
    }

    const newBlog = await Blog.create({ title, content });

    res.status(201).json({
      success: true,
      message: "Blog created successfully!",
      blog: newBlog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get all blog posts
export const getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.status(200).json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get a single blog post by ID
export const getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });
    }
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update a blog post
export const updateBlog = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title && !content) {
      return res.status(400).json({
        success: false,
        message: "At least one field (title or content) is required to update",
      });
    }

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { title, content },
      { new: true, runValidators: true }
    );

    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });
    }

    res.status(200).json({
      success: true,
      message: "Blog updated successfully!",
      blog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a blog post
export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });
    }
    res.status(200).json({
      success: true,
      message: "Blog deleted successfully!",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Upload blog image to the s3 and return url
export const uploadBlogImage = async (req, res) => {
  if (!req.file || !req.file.url) {
    return res.status(400).json({
      success: false,
      message: "Image upload failed",
    });
  }

  return res.json({
    success: true,
    url: req.file.url,
  });
};
