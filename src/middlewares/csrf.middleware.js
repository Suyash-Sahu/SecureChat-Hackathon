import crypto from 'crypto';

function getOrCreateCsrfToken(req, res) {
    const existing = req.cookies && req.cookies.csrfToken;
    if (existing && typeof existing === 'string' && existing.length >= 16) {
        return existing;
    }
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrfToken', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    return token;
}

// Ensures a csrfToken cookie exists on safe methods so the client can read it
export function setCsrfCookie(req, res, next) {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        getOrCreateCsrfToken(req, res);
    }
    next();
}

// Verifies X-CSRF-Token matches csrfToken cookie on unsafe methods
export function verifyCsrfToken(req, res, next) {
    try {
        const method = (req.method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return next();
        }

        // Exempt socket.io polling, health, and auth routes
        const path = req.path || '';
        if (path.startsWith('/socket.io/') || path.startsWith('/api/v1/auth/')) {
            return next();
        }

        const cookieToken = req.cookies && req.cookies.csrfToken;
        const headerToken = req.get('X-CSRF-Token') || req.get('x-csrf-token');

        if (!cookieToken || !headerToken || cookieToken !== headerToken) {
            return res.status(403).json({ success: false, error: 'Invalid CSRF token', code: 'CSRF_INVALID' });
        }
        return next();
    } catch (e) {
        return res.status(403).json({ success: false, error: 'CSRF verification failed', code: 'CSRF_ERROR' });
    }
}


