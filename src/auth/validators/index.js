import { body } from "express-validator";

const userRegisterValidator = () => {
    return [
        body("email")
            .trim()
            .notEmpty()
            .withMessage("Email is required")
            .isEmail()
            .withMessage("Email is invalid"),
        body("username")
            .trim()
            .notEmpty()
            .withMessage("Username is required")
            .isLowercase()
            .withMessage("Username should be in lowercase")
            .isLength({ min: 3 })
            .withMessage("Username must be atleast 3 characters long"),
        body("password").trim().notEmpty().withMessage("Password is required"),
        body("Fullname").optional().trim(),
    ];
};

const userLoginValidator = () => {
    return [
        body("email").optional().isEmail().withMessage("Email is Invalid"),
        body("password").notEmpty().withMessage("Password is required"),
    ];
};

const userChangeCurrentPasswordValidator = () => {
    return [
        body("oldPassword").notEmpty().withMessage("Old password is required"),
        body("newPassword").notEmpty().withMessage("New password is required"),

    ]
}

const userForgotPasswordValidator = () => {
    return [
        body("email").notEmpty().withMessage("email is required").isEmail().withMessage("Email is invalid"),
    ]
}

const userResetForgotPasswordValidator = () => {
    return [
        body("email")
            .trim()
            .notEmpty()
            .withMessage("Email is required")
            .isEmail()
            .withMessage("Email is invalid"),
        body("otp")
            .trim()
            .notEmpty()
            .withMessage("OTP is required")
            .isLength({ min: 6, max: 6 })
            .withMessage("OTP must be 6 digits")
            .isNumeric()
            .withMessage("OTP must contain only numbers"),
        body("newPassword")
            .trim()
            .notEmpty()
            .withMessage("New password is required")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters long")
    ]
}

const userEmailOtpValidator = () => {
    return [
        body("email")
            .trim()
            .notEmpty()
            .withMessage("Email is required")
            .isEmail()
            .withMessage("Email is invalid"),
    ];
};

const userVerifyEmailOtpValidator = () => {
    return [
        body("email")
            .trim()
            .notEmpty()
            .withMessage("Email is required")
            .isEmail()
            .withMessage("Email is invalid"),
        body("otp")
            .trim()
            .notEmpty()
            .withMessage("OTP is required")
            .isLength({ min: 6, max: 6 })
            .withMessage("OTP must be 6 digits")
            .isNumeric()
            .withMessage("OTP must contain only numbers"),
    ];
};

export { 
    userRegisterValidator,
    userLoginValidator,
    userChangeCurrentPasswordValidator,
    userForgotPasswordValidator,
    userResetForgotPasswordValidator,
    userEmailOtpValidator,
    userVerifyEmailOtpValidator
};
