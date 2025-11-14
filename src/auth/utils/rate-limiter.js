import rateLimit from 'express-rate-limit';
import { ApiError } from './api-error.js';

// Create a more scalable rate limiting configuration
export const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res, next, options) => {
      throw new ApiError(429, options.message || 'Too many requests, please try again later.');
    }
  };

  return rateLimit({ ...defaultOptions, ...options });
};

// Auth rate limiter (more generous for handling multiple users)
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased limit for handling more users
  message: "Too many authentication requests from this IP, please try again later."
});

// OTP rate limiter (per-email basis for better scalability)
export const otpLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each email/IP to 5 OTP requests per windowMs
  keyGenerator: (req) => {
    // Use email as key for OTP requests if available, otherwise use IP
    if (req.body && req.body.email) {
      return `otp_${req.body.email}`;
    }
    return `otp_ip_${req.ip}`;
  },
  message: "Too many OTP requests. Please wait before requesting another code."
});

// Email sending rate limiter (to prevent email spam)
export const emailRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each email to 10 emails per hour
  keyGenerator: (req) => {
    if (req.body && req.body.email) {
      return `email_${req.body.email}`;
    }
    return `email_ip_${req.ip}`;
  },
  message: "Too many email requests. Please wait before requesting another email."
});

// General API rate limiter
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased limit for handling more users
  message: "Too many requests from this IP, please try again later."
});

// Strict rate limiter for sensitive operations
export const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Very strict limit
  message: "Too many requests. Please wait before trying again."
});