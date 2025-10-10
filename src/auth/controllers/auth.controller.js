import { User } from "../models/user.models.js"
import { ApiResponse } from "../utils/api-response.js"
import { ApiError } from "../utils/api-error.js"
import { asyncHandler } from "../utils/async-handler.js"
import { emailVerificationMailContent, forgotPasswordMailContent, sendEmail } from "../utils/mail.js"
import jwt from "jsonwebtoken"
import crypto from "crypto";


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
        const { email, username, password, role } = req.body

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

        // Create user
        const user = await User.create({
            email,
            password,
            username,
            isEmailVerified: true // Skip email verification for now
        })

        if (!user) {
            throw new ApiError(500, "Failed to create user")
        }

        // Skip email verification for now
        // Email verification will be implemented later

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
                    "User registered successfully. You can now log in."
                )
            )
    } catch (error) {
        console.error('Registration error:', error)
        if (error instanceof ApiError) {
            throw error
        }
        throw new ApiError(500, "Internal server error during registration")
    }
})

const login = asyncHandler(async (req, res) => {
    try {
        const { email, password } = req.body

        // Enhanced validation
        if (!email || !password) {
            throw new ApiError(400, "Email and password are required")
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new ApiError(400, "Invalid input format")
        }

        if (email.length > 254) {
            throw new ApiError(400, "Email too long")
        }

        if (password.length < 6) {
            throw new ApiError(400, "Password must be at least 6 characters long")
        }

        if (password.length > 128) {
            throw new ApiError(400, "Password too long")
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email format")
        }

        const user = await User.findOne({ email }).select("+password")

        if (!user) {
            throw new ApiError(401, "Invalid credentials")
        }

        // Email verification is currently disabled
        // All users are considered verified for now

        const isPasswordValid = await user.isPasswordCorrect(password)

        if (!isPasswordValid) {
            throw new ApiError(401, "Invalid credentials")
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

        const loggedInUser = await User.findById(user._id).select(
            "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
        )

        if (!loggedInUser) {
            throw new ApiError(500, "Failed to retrieve user data")
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(200, {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                    "User logged in successfully"
                )
            )
    } catch (error) {
        console.error('Login error:', error)
        if (error instanceof ApiError) {
            throw error
        }
        throw new ApiError(500, "Internal server error during login")
    }
})


const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id, {
        $set: {
            refreshToken: "",
        },
    },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "User logged out ")
        )
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched sucessfully"))
})

const verifyEmail = asyncHandler(async (req, res) => {
    const { verificationToken } = req.params

    if (!verificationToken) {
        throw new ApiError(400, "Email verification token is missing")
    }

    let hashedToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex")

    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { $gt: Date.now() }
    })

    if (!user) {
        throw new ApiError(400, "Token is invalid or expired")
    }

    user.emailVerificationExpiry = undefined
    user.emailVerificationToken = undefined

    user.isEmailVerified = true
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    isEmailVerified: true
                },
                "Email isverified"
            )
        )
})

const resendEmailVerification = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?._id)

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }

    if (user.isEmailVerified) {
        throw new ApiError(409, "Email is already verified")
    }

    const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken()

    user.emailVerificationExpiry = tokenExpiry
    user.emailVerificationToken = hashedToken

    await user.save({ validateBeforeSave: false })

    await sendEmail({
        email: user?.email,
        subject: "Please verify your email",
        mailgenContent: emailVerificationMailContent(
            user.username,
            `${req.protocol}://${req.get("host")}/api/v1/auth/verify-email/${unHashedToken}`
        )
    })

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Mail has been sent to your email ID"
        )
    )
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken ||
        req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)

        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token in expired")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(user._id)

        user.refreshToken = newRefreshToken
        await user.save()

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
            )

    } catch (error) {
        throw new ApiError(401, "Invalid refresh token")

    }
})

const forgotPasswordRequest = asyncHandler(async (req, res) => {
    const { email } = req.body
    const user = await User.findOne({ email })
    if (!user) {
        throw new ApiError(404, "User does not exist")
    }

    const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken()

    user.forgotPasswordExpiry = tokenExpiry
    user.forgotPasswordToken = hashedToken

    await user.save({ validateBeforeSave: false })

    await sendEmail({
        email: user?.email,
        subject: "password reset request",
        mailgenContent: forgotPasswordMailContent(
            user.username,
            `${process.env.FORGOT_PASSWORD_REDIRECT_URL}/${unHashedToken}`
        )
    })

    return res
        .status(200)
        .json(
            new ApiResponse(200,
                {},
                "Password reset mail has been sent on your email id"
            )
        )
})

const resetForgotPassword = asyncHandler(async (req, res) => {
    const { resetToken } = req.params
    const { newPassword } = req.body

    let hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex")

    const user = await User.findOne({
        forgotPasswordExpiry: { $gt: Date.now() },
        forgotPasswordToken: hashedToken
    })

    if (!user) {
        throw new ApiError(489, "Token invalid or expired")
    }

    user.forgotPasswordExpiry = undefined
    user.forgotPasswordToken = undefined

    user.password = newPassword

    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset Sucessfully"
            )
        )
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Password changed sucessfully"
        )
    )

})

export { registerUser, login, logoutUser, getCurrentUser, verifyEmail, resendEmailVerification, refreshAccessToken, forgotPasswordRequest, resetForgotPassword, changeCurrentPassword }

