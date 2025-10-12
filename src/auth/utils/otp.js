import crypto from 'crypto';

export function generateNumericOtp(digits = 6) {
    const max = Math.pow(10, digits) - 1;
    const code = (Math.floor(Math.random() * (max + 1))).toString().padStart(digits, '0');
    return code;
}

export function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

export function isCooldownActive(lastSentAt, cooldownMs) {
    if (!lastSentAt) return false;
    return (Date.now() - new Date(lastSentAt).getTime()) < cooldownMs;
}

export function isExpired(expiry) {
    if (!expiry) return true;
    return new Date(expiry).getTime() < Date.now();
}


