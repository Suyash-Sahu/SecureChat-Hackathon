import { Router } from "express"
import { changeCurrentPassword, forgotPasswordRequest, getCurrentUser, login, logoutUser, refreshAccessToken, registerUser, resendEmailVerification, resetForgotPassword, verifyEmail, requestEmailOtp, verifyEmailOtp, verifyOtpHandler } from "../controllers/auth.controller.js"
import {validate} from "../middlewares/validator.middleware.js"
import { userChangeCurrentPasswordValidator, userForgotPasswordValidator, userRegisterValidator, userResetForgotPasswordValidator, userLoginValidator, userEmailOtpValidator, userVerifyEmailOtpValidator } from "../validators/index.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"


const router= Router()
// unsecured route
router.route("/register").post(userRegisterValidator(), validate, registerUser)
router.route("/login").post(userLoginValidator(), validate, login)
router.route("/verify-email/:verificationToken").get(verifyEmail)
router.route("/verify-otp").post(verifyOtpHandler)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/forgot-password").post(userForgotPasswordValidator(), validate, forgotPasswordRequest)
router.route("/reset-password/:resetToken").post(userResetForgotPasswordValidator(), validate, resetForgotPassword )

// email/otp
router.route("/request-email-otp").post(userEmailOtpValidator(), validate, requestEmailOtp)
router.route("/verify-email-otp").post(userVerifyEmailOtpValidator(), validate, verifyEmailOtp)





// secure route
router.route("/logout").post(verifyJWT, logoutUser)
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/change-password").post(verifyJWT, userChangeCurrentPasswordValidator(),validate,changeCurrentPassword )
router.route("/resend-email-verification").post(verifyJWT, resendEmailVerification)




export default router; 