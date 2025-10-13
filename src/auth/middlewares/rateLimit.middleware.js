import { ApiError } from "../utils/api-error.js";

/**
 * Middleware to handle rate limit errors more gracefully
 */
export const rateLimitHandler = (err, req, res, next) => {
  // Check if this is a rate limit error
  if (err.name === 'TooManyRequestsError' || err.code === 'TOO_MANY_REQUESTS') {
    // Log the rate limit event for monitoring
    console.warn(`Rate limit exceeded for ${req.ip} on ${req.originalUrl}`);
    
    // Return a more user-friendly error response
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please wait a moment and try again.",
      code: "TOO_MANY_REQUESTS",
      retryAfter: err.retryAfter || 60 // Default to 60 seconds if not specified
    });
  }
  
  // If not a rate limit error, pass it to the next error handler
  next(err);
};