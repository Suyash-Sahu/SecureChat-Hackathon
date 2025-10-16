import jwt from 'jsonwebtoken';
import { User } from '../auth/models/user.models.js';

function verifyJWT(req, res, next) {
  try {
    // Check for token in multiple locations
    const authHeader = req.header('Authorization') || '';
    const cookieToken = req.cookies && req.cookies.accessToken;
    const token = cookieToken || authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    // Validate decoded token structure
    if (!decoded._id || !decoded.email || !decoded.username) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token structure',
        code: 'INVALID_TOKEN'
      });
    }

    // Add user info to request
    req.user = { 
      _id: decoded._id, 
      id: decoded._id, 
      email: decoded.email, 
      username: decoded.username,
      role: decoded.role
    };
    
    return next();
  } catch (error) {
    console.error('JWT verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token not active',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }
    
    return res.status(401).json({ 
      success: false,
      error: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_FAILED'
    });
  }
}

// Require email verification for protected features
export async function requireEmailVerified(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_USER' });
    }
    const user = await User.findById(req.user.id).select('isEmailVerified');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_USER' });
    }
    if (!user.isEmailVerified) {
      return res.status(403).json({ success: false, error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Verification check failed', code: 'VERIFY_ERROR' });
  }
}

export { verifyJWT };