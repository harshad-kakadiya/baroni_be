import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
    {
        contact: {
            type: String,
            required: true,
            trim: true,
        },
        otp: {
            type: String,
            required: true,
        },
        token: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            expires: 900,
        },
    },
    { timestamps: true }
);

const Otp = mongoose.model("Otp", otpSchema);
export default Otp;
