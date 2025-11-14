import { ApiError } from "../utils/api-error.js";
import { rateLimit } from 'express-rate-limit';

/**
 * Middleware to handle rate limit errors more gracefully
 */
export const rateLimitHandler = (err, req, res, next) => {
  // Check if this is a rate limit error
  if (err.name === 'TooManyRequestsError' || err.code === 'TOO_MANY_REQUESTS' || err instanceof rateLimit.RateLimitExceeded) {
    // Log the rate limit event for monitoring
    console.warn(`Rate limit exceeded for ${req.ip} on ${req.originalUrl}`, {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    });
    
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

/**
 * Custom rate limit middleware with enhanced logging
 */
export const createCustomRateLimiter = (options) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
      console.warn(`Rate limit exceeded for ${req.ip} on ${req.originalUrl}`, {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        max: options.max,
        windowMs: options.windowMs
      });
      
      res.status(429).json({
        success: false,
        message: options.message || "Too many requests. Please wait a moment and try again.",
        code: "TOO_MANY_REQUESTS"
      });
    }
  };
  
  return rateLimit({ ...defaultOptions, ...options });
};