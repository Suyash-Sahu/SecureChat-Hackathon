import { User } from "../models/user.models.js"
import { ApiResponse } from "../utils/api-response.js"
import { ApiError } from "../utils/api-error.js"
import { asyncHandler } from "../utils/async-handler.js"
import { emailVerificationMailContent, forgotPasswordMailContent, sendEmail } from "../utils/mail.js"
import jwt from "jsonwebtoken"
import crypto from "crypto";
import { generateNumericOtp, hashOtp, isCooldownActive, isExpired, verifyOtp } from "../utils/otp.js";
import { sendEmailOtp } from "../utils/sms.js";

const verifyOtpHandler = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(400, "Email and OTP are required");
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Check if email is already verified
    if (user.isEmailVerified) {
        return res.status(200).json(
            new ApiResponse(200, { isEmailVerified: true }, "Email is already verified")
        );
    }

    // Verify OTP
    const isOtpValid = await verifyOtp(otp, user.emailOtp, user.emailOtpExpiry);
    
    if (!isOtpValid) {
        // Increment failed attempts
        user.emailOtpAttempts = (user.emailOtpAttempts || 0) + 1;
        await user.save({ validateBeforeSave: false });
        
        throw new ApiError(400, "Invalid or expired OTP");
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpiry = undefined;
    user.emailOtpAttempts = 0;
    await user.save({ validateBeforeSave: false });

    // Generate tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    // Get user data without sensitive information
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                    isEmailVerified: true
                },
                "Email verified successfully"
            )
        );
});


const generateAccessAndRefreshToken = async (userID) => {
    try {
        const user = await User.findById(userID)
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    try {
        console.log('Registration attempt with data:', req.body);
        const { email, username, password, role, phone, phoneCountryCode } = req.body;

        // Input validation
        if (!email || !username || !password) {
            throw new ApiError(400, "Email, username, and password are required");
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email format");
        }

        // Check if user already exists
        const existedUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existedUser) {
            if (existedUser.email === email) {
                throw new ApiError(409, "Email already registered");
            } else {
                throw new ApiError(409, "Username already taken");
            }
        }

        // Create new user
        const user = await User.create({
    email,
    password,
    username,
    role: (role && role.toUpperCase()) || "USER", // Ensure role is uppercase
    phone: phone || "",
    phoneCountryCode: phoneCountryCode || "",
    isEmailVerified: false,
    isActive: false,
    emailOtp: "",
    emailOtpExpiry: null,
    emailOtpAttempts: 0,
    emailOtpLastSentAt: null
});

        if (!user) {
            throw new ApiError(500, "Failed to create user");
        }

        // Generate OTP and set expiry (10 minutes)
        const otp = generateNumericOtp(6);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        // Update user with OTP details
        user.emailOtp = hashOtp(otp);
        user.emailOtpExpiry = otpExpiry;
        user.emailOtpLastSentAt = new Date();
        user.emailOtpAttempts = 0;

        try {
            await user.save({ validateBeforeSave: false });
            
            // Send OTP email
            await sendEmailOtp({
                to: user.email,
                otp: otp,
                username: user.username
            });

            console.log('Verification OTP sent successfully');

            // Return success response
            const createdUser = await User.findById(user._id).select("-password -refreshToken -emailOtp -emailOtpExpiry -emailOtpAttempts -emailOtpLastSentAt");

            return res
                .status(201)
                .json(
                    new ApiResponse(
                        201,
                        { user: createdUser },
                        "Registration successful! Please check your email for the verification OTP."
                    )
                );

        } catch (error) {
            console.error('Error sending OTP:', {
                message: error.message,
                stack: error.stack,
                code: error.code
            });

            // Clean up user if OTP sending fails
            await User.findByIdAndDelete(user._id);
            
            throw new ApiError(500, 'Failed to send verification OTP. Please try again later.');
        }

    } catch (error) {
        console.error('Registration error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        });

        // Handle duplicate key errors
        if (error.name === 'MongoServerError' && error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            throw new ApiError(409, `${field} '${error.keyValue[field]}' is already registered`);
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            throw new ApiError(400, `Validation failed: ${messages.join(', ')}`);
        }

        // Re-throw if it's already an ApiError
        if (error instanceof ApiError) {
            throw error;
        }

        // Default error
        throw new ApiError(500, error.message || 'Registration failed. Please try again.');
    }
});

// OTP: request email verification code
const requestEmailOtp = asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
        throw new ApiError(400, 'Email is required');
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, 'User with this email not found');
    }

    if (user.isEmailVerified) {
        throw new ApiError(409, 'Email already verified');
    }

    // Cooldown: 60s, Max TTL: 10m
    const COOLDOWN_MS = 60 * 1000;
    const TTL_MS = 10 * 60 * 1000;

    if (isCooldownActive(user.emailOtpLastSentAt, COOLDOWN_MS)) {
        throw new ApiError(429, 'OTP recently sent. Please wait before requesting again');
    }

    const otp = generateNumericOtp(6);
    user.emailOtp = hashOtp(otp); // Hash the OTP before saving
    user.emailOtpExpiry = new Date(Date.now() + TTL_MS);
    user.emailOtpLastSentAt = new Date();
    user.emailOtpAttempts = 0; // reset on new code
    await user.save({ validateBeforeSave: false });

    await sendEmailOtp({ to: email, otp, username: user.username });

    return res.status(200).json(new ApiResponse(200, {}, 'OTP sent successfully to your email'));
});

// OTP: verify email
const verifyEmailOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
        throw new ApiError(400, 'Email and OTP are required');
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, 'User with this email not found');
    }

    if (user.isEmailVerified) {
        throw new ApiError(400, 'Email is already verified');
    }

    // Check if OTP exists and is not expired
    if (!user.emailOtp || !user.emailOtpExpiry) {
        throw new ApiError(400, 'No pending OTP verification found');
    }

    if (new Date() > user.emailOtpExpiry) {
        throw new ApiError(400, 'OTP has expired. Please request a new one.');
    }

    // Verify OTP
    const hashedOtp = hashOtp(otp);
    if (user.emailOtp !== hashedOtp) {
        // Increment OTP attempts
        user.emailOtpAttempts = (user.emailOtpAttempts || 0) + 1;
        await user.save({ validateBeforeSave: false });
        
        throw new ApiError(400, 'Invalid OTP');
    }

    // Mark email as verified, activate account, and clear OTP fields
    user.isEmailVerified = true;
    user.isActive = true; // Activate the user account
    user.emailOtp = undefined;
    user.emailOtpExpiry = undefined;
    user.emailOtpAttempts = 0;
    user.emailOtpLastSentAt = undefined;
    await user.save({ validateBeforeSave: false });

    // Log the successful verification
    console.log(`User ${user.email} verified and activated successfully`);

    // Generate tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
    
    // Get user details excluding sensitive information
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken -emailOtp -emailOtpExpiry -emailOtpAttempts -emailOtpLastSentAt"
    );

    // Set refresh token in HTTP-only cookie
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "Email verified successfully"
            )
        );
});

// Login function
const login = asyncHandler(async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new ApiError(400, "Email and password are required");
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new ApiError(400, "Invalid input format");
        }

        if (email.length > 254) {
            throw new ApiError(400, "Email too long");
        }

        if (password.length < 6) {
            throw new ApiError(400, "Password must be at least 6 characters long");
        }

        if (password.length > 128) {
            throw new ApiError(400, "Password too long");
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email format");
        }

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            throw new ApiError(401, "Invalid credentials");
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            // Generate and send a new OTP if needed
            if (!user.emailOtp || new Date() > user.emailOtpExpiry) {
                const otp = generateNumericOtp(6);
                const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                
                user.emailOtp = hashOtp(otp);
                user.emailOtpExpiry = otpExpiry;
                user.emailOtpLastSentAt = new Date();
                await user.save({ validateBeforeSave: false });
                
                // Send the new OTP via email
                await sendEmail({
                    email: user.email,
                    subject: 'New Verification Code - Secure Chat',
                    mailgenContent: emailVerificationMailContent(
                        user.username,
                        otp,
                        '10 minutes'
                    )
                });
            }
            
            throw new ApiError(403, "Please verify your email before logging in. A new verification code has been sent to your email.");
        }

        const isPasswordValid = await user.isPasswordCorrect(password);

        if (!isPasswordValid) {
            throw new ApiError(401, "Invalid credentials");
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

        const loggedInUser = await User.findById(user._id).select(
            "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        );

        if (!loggedInUser) {
            throw new ApiError(500, "Failed to retrieve user data");
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser,
                        accessToken,
                        refreshToken
                    },
                    "User logged in successfully"
                )
            );
    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, "Internal server error during login");
    }
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: "",
            },
        },
        {
            new: true
        }
    );

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        );
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const verifyEmail = asyncHandler(async (req, res) => {
    const { verificationToken } = req.params;

    if (!verificationToken) {
        throw new ApiError(400, "Email verification token is missing");
    }

    let hashedToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { $gt: Date.now() }
    });

    if (!user) {
        throw new ApiError(400, "Token is invalid or expired");
    }

    user.emailVerificationExpiry = undefined;
    user.emailVerificationToken = undefined;
    user.isEmailVerified = true;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    isEmailVerified: true
                },
                "Email verified successfully"
            )
        );
});

const resendEmailVerification = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?._id);

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    if (user.isEmailVerified) {
        throw new ApiError(409, "Email is already verified");
    }

    const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken();

    user.emailVerificationExpiry = tokenExpiry;
    user.emailVerificationToken = hashedToken;

    await user.save({ validateBeforeSave: false });

    await sendEmail({
        email: user?.email,
        subject: "Please verify your email",
        mailgenContent: emailVerificationMailContent(
            user.username,
            `${req.protocol}://${req.get("host")}/api/v1/auth/verify-email/${unHashedToken}`
        )
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Mail has been sent to your email ID"
        )
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access");
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired");
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        };

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            );

    } catch (error) {
        throw new ApiError(401, "Invalid refresh token");
    }
});

const forgotPasswordRequest = asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        throw new ApiError(400, "Email is required");
    }
    
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken();

    user.forgotPasswordExpiry = tokenExpiry;
    user.forgotPasswordToken = hashedToken;

    await user.save({ validateBeforeSave: false });

    await sendEmail({
        email: user?.email,
        subject: "Password reset request",
        mailgenContent: forgotPasswordMailContent(
            user.username,
            `${process.env.FORGOT_PASSWORD_REDIRECT_URL}/${unHashedToken}`
        )
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset mail has been sent to your email"
            )
        );
});

const resetForgotPassword = asyncHandler(async (req, res) => {
    const { resetToken } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
        throw new ApiError(400, "New password is required");
    }

    if (newPassword.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters long");
    }

    let hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    const user = await User.findOne({
        forgotPasswordExpiry: { $gt: Date.now() },
        forgotPasswordToken: hashedToken
    });

    if (!user) {
        throw new ApiError(400, "Token invalid or expired");
    }

    user.forgotPasswordExpiry = undefined;
    user.forgotPasswordToken = undefined;
    user.password = newPassword;

    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset successfully"
            )
        );
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old password and new password are required");
    }

    if (newPassword.length < 6) {
        throw new ApiError(400, "New password must be at least 6 characters long");
    }

    const user = await User.findById(req.user?._id).select("+password");
    
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    
    const isPasswordValid = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password changed successfully"
            )
        );
});

export {
    registerUser,
    login,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    changeCurrentPassword,
    forgotPasswordRequest,
    resetForgotPassword,
    verifyEmail,
    resendEmailVerification,
    requestEmailOtp,
    verifyEmailOtp,
    verifyOtpHandler
};