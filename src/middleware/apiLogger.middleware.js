import ApiLog from "../models/apiLog.model.js";

export const apiLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", async () => {
    try {
      const responseTime =
        Number(process.hrtime.bigint() - start) / 1_000_000;

      const endpoint =
        req.baseUrl && req.route?.path
          ? `${req.baseUrl}${req.route.path}`
          : req.path;

      await ApiLog.create({
        method: req.method,
        endpoint,
        statusCode: res.statusCode,
        responseTime: Math.round(responseTime),
        userId: req.user?.id || req.user?._id || null,
        success: res.statusCode < 400,
      });
    } catch (error) {
      console.error("API logging failed:", error.message);
    }
  });

  next();
};