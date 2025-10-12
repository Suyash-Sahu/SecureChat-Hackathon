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

/**
 * Verify if the provided OTP matches the hashed OTP and is not expired
 * @param {string} otp - The OTP to verify
 * @param {string} hashedOtp - The hashed OTP to compare against
 * @param {Date} expiry - The expiry time of the OTP
 * @returns {boolean} - True if OTP is valid, false otherwise
 */
export function verifyOtp(otp, hashedOtp, expiry) {
    try {
        // If any required parameter is missing, return false
        if (!otp || !hashedOtp || !expiry) {
            console.log('Missing OTP verification parameters');
            return false;
        }

        // Check if OTP is expired
        if (isExpired(expiry)) {
            console.log('OTP has expired');
            return false;
        }

        // Hash the provided OTP and compare with stored hash
        const hashedInput = hashOtp(otp);
        const isValid = crypto.timingSafeEqual(
            Buffer.from(hashedInput, 'utf8'),
            Buffer.from(hashedOtp, 'utf8')
        );

        if (!isValid) {
            console.log('Invalid OTP provided');
        }

        return isValid;
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return false;
    }
}
