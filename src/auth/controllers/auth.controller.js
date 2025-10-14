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

        // Enhanced validation
        if (!email || !username || !password) {
            throw new ApiError(400, "Email, username, and password are required")
        }

        if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
            throw new ApiError(400, "Invalid input format")
        }

        // Email validation
        if (email.length > 254) {
            throw new ApiError(400, "Email too long")
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email format")
        }

        // Username validation
        if (username.length < 3) {
            throw new ApiError(400, "Username must be at least 3 characters long")
        }

        if (username.length > 20) {
            throw new ApiError(400, "Username must be less than 20 characters")
        }

        if (!/^[a-z0-9_]+$/.test(username)) {
            throw new ApiError(400, "Username can only contain lowercase letters, numbers, and underscores")
        }

        // Password validation
        if (password.length < 6) {
            throw new ApiError(400, "Password must be at least 6 characters long")
        }

        if (password.length > 128) {
            throw new ApiError(400, "Password too long")
        }

        // Check for existing user
        const existedUser = await User.findOne({
            $or: [{ username }, { email }]
        })

        if (existedUser) {
            if (existedUser.email === email) {
                throw new ApiError(409, "Email already registered")
            } else {
                throw new ApiError(409, "Username already taken")
            }
        }

        // Create user as inactive by default
        const user = await User.create({
            email,
            password,
            username,
            isEmailVerified: false,
            isActive: false, // User is inactive until email is verified
            phone: phone || undefined,
            phoneCountryCode: phoneCountryCode || ""
        })

        if (!user) {
            throw new ApiError(500, "Failed to create user");
        }

        // Generate and send verification OTP
        const otp = generateNumericOtp(6);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        
        // Save OTP hash to user
        user.emailOtp = hashOtp(otp);
        user.emailOtpExpiry = otpExpiry;
        user.emailOtpLastSentAt = new Date();
        user.emailOtpAttempts = 0;
        
        try {
            await user.save({ validateBeforeSave: false });

            // Prepare email content using the emailVerificationMailContent helper
            const emailContent = {
                email: user.email,
                subject: 'Verify Your Email - Secure Chat',
                mailgenContent: emailVerificationMailContent(
                    user.username,
                    otp // Pass only the OTP, not a verification URL
                )
            };

            console.log('Sending verification email to:', user.email);
            await sendEmail(emailContent);
            console.log('Verification email sent successfully');
            
        } catch (error) {
            console.error('Error during registration:', {
                message: error.message,
                stack: error.stack,
                code: error.code,
                response: error.response,
                request: error.config ? {
                    url: error.config.url,
                    method: error.config.method,
                    headers: error.config.headers,
                    data: error.config.data
                } : 'No request config',
                fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
            });
            
            // More specific error messages based on error type
            if (error.code === 'EAUTH' || error.responseCode) {
                // Even if email fails, we still create the user and let them request OTP later
                console.log('Email failed but user created successfully. User can request OTP later.');
                const createdUser = await User.findById(user._id).select(
                    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
                )

                if (!createdUser) {
                    throw new ApiError(500, "Failed to retrieve created user")
                }

                return res
                    .status(201)
                    .json(
                        new ApiResponse(
                            201,
                            { user: createdUser },
                            "User registered successfully. Please check your email for the verification code, or request a new one if you don't receive it."
                        )
                    )
            }
            
            throw new ApiError(500, 'Failed to complete registration. Please try again.');
        }

        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        )

        if (!createdUser) {
            throw new ApiError(500, "Failed to retrieve created user")
        }

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    { user: createdUser },
                    "User registered successfully. Please verify your email with the OTP sent."
                )
            )
    } catch (error) {
        console.error('Registration error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            keyValue: error.keyValue
        });
        
        // Handle duplicate key errors (MongoDB)
        if (error.name === 'MongoServerError' && error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            throw new ApiError(409, `${field} '${error.keyValue[field]}' is already registered`);
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            throw new ApiError(400, `Validation failed: ${messages.join(', ')}`);
        }
        
        // Handle rate limit errors
        if (error.name === 'TooManyRequestsError' || (error.code && error.code === 'TOO_MANY_REQUESTS')) {
            throw new ApiError(429, "Too many registration requests. Please wait a moment and try again.");
        }
        
        if (error instanceof ApiError) {
            throw error;
        }
        
        // Return a more detailed error in development
        const errorMessage = process.env.NODE_ENV === 'development' 
            ? `Registration failed: ${error.message}`
            : 'Server error. Please try again later.';
            
        throw new ApiError(500, errorMessage);
    }
})

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
        // More informative error message
        const timeRemaining = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(user.emailOtpLastSentAt).getTime())) / 1000);
        throw new ApiError(429, `Please wait ${timeRemaining} seconds before requesting another OTP`);
    }

    const otp = generateNumericOtp(6);
    user.emailOtp = hashOtp(otp); // Hash the OTP before saving
    user.emailOtpExpiry = new Date(Date.now() + TTL_MS);
    user.emailOtpLastSentAt = new Date();
    user.emailOtpAttempts = 0; // reset on new code
    
    try {
        await user.save({ validateBeforeSave: false });
    } catch (saveError) {
        console.error('Failed to save user OTP data:', saveError);
        throw new ApiError(500, 'Failed to update user data. Please try again.');
    }

    try {
        await sendEmailOtp({ to: email, otp, username: user.username });
        console.log(`OTP successfully queued for email: ${email}`);
    } catch (emailError) {
        console.error('Failed to send OTP email:', emailError);
        // Even if email fails, we still return success to the client
        // because the OTP is generated and saved successfully
        return res.status(200).json(new ApiResponse(200, {}, 'OTP generated successfully. If you do not receive the email, please check your spam folder or try again.'));
    }

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
                
                try {
                    await user.save({ validateBeforeSave: false });
                    
                    // Send the new OTP via email
                    await sendEmail({
                        email: user.email,
                        subject: 'New Verification Code - Secure Chat',
                        mailgenContent: emailVerificationMailContent(
                            user.username,
                            otp // Pass only the OTP, not a verification URL
                        )
                    });
                } catch (saveError) {
                    console.error('Failed to save user or send OTP during login:', saveError);
                    // Continue with login flow even if OTP sending fails
                }
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
        
        // Handle rate limit errors specifically
        if (error.name === 'TooManyRequestsError' || (error.code && error.code === 'TOO_MANY_REQUESTS')) {
            throw new ApiError(429, "Too many login attempts. Please wait a moment and try again.");
        }
        
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
        // For security reasons, we don't reveal if the email exists or not
        return res.status(200).json(
            new ApiResponse(
                200,
                {},
                "If the email exists in our system, a password reset OTP has been sent to it."
            )
        );
    }

    // Generate a 6-digit OTP
    const otp = generateNumericOtp(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    // Hash the OTP before saving
    user.forgotPasswordOtp = hashOtp(otp);
    user.forgotPasswordOtpExpiry = otpExpiry;
    user.forgotPasswordOtpAttempts = 0;
    
    await user.save({ validateBeforeSave: false });

    try {
        // Send the OTP via email
        await sendEmail({
            email: user.email,
            subject: "Password Reset OTP - Secure Chat",
            mailgenContent: forgotPasswordMailContent(
                user.username,
                otp
            )
        });
        
        console.log(`Password reset OTP sent to ${user.email}`);
    } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Even if email fails, we still return success to the client
        // because the OTP is generated and saved successfully
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "If the email exists in our system, a password reset OTP has been sent to it."
            )
        );
});

const resetForgotPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    // Validate input
    if (!email || !otp || !newPassword) {
        throw new ApiError(400, "Email, OTP, and new password are required");
    }

    if (newPassword.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters long");
    }

    // Find the user
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Check if OTP exists and is not expired
    if (!user.forgotPasswordOtp || !user.forgotPasswordOtpExpiry) {
        throw new ApiError(400, "No pending password reset request found");
    }

    if (new Date() > user.forgotPasswordOtpExpiry) {
        throw new ApiError(400, "OTP has expired. Please request a new one.");
    }

    // Verify OTP
    const hashedOtp = hashOtp(otp);
    if (user.forgotPasswordOtp !== hashedOtp) {
        // Increment OTP attempts
        user.forgotPasswordOtpAttempts = (user.forgotPasswordOtpAttempts || 0) + 1;
        
        // If too many failed attempts, clear the OTP
        if (user.forgotPasswordOtpAttempts >= 5) {
            user.forgotPasswordOtp = undefined;
            user.forgotPasswordOtpExpiry = undefined;
            user.forgotPasswordOtpAttempts = 0;
        }
        
        await user.save({ validateBeforeSave: false });
        
        throw new ApiError(400, "Invalid OTP");
    }

    // Update the password
    user.password = newPassword;
    
    // Clear OTP fields
    user.forgotPasswordOtp = undefined;
    user.forgotPasswordOtpExpiry = undefined;
    user.forgotPasswordOtpAttempts = 0;
    
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