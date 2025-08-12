import express from 'express';
import passport from 'passport';
import { register, login, refresh, forgotPassword, resetPassword, verifyOtp, completeProfile } from '../../controllers/auth.js';
import { registerValidator, loginValidator, verifyOtpValidator, completeProfileValidator } from '../../validators/authValidators.js';
import { requireAuth } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import { createAccessToken, createRefreshToken } from '../../utils/token.js';

const router = express.Router();

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-otp', verifyOtpValidator, verifyOtp);
router.post('/complete-profile', requireAuth, upload.single('profilePic'), completeProfileValidator, completeProfile);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/google/failure' }),
  (req, res) => {
    const at = createAccessToken({ userId: req.user._id });
    const rt = createRefreshToken({ userId: req.user._id });
    res.json({ success: true, data: { id: req.user._id, email: req.user.email, name: req.user.name, pseudo: req.user.pseudo, profilePic: req.user.profilePic }, tokens: { accessToken: at, refreshToken: rt } });
  }
);

router.get('/apple', passport.authenticate('apple'));
router.post(
  '/apple/callback',
  passport.authenticate('apple', { session: false, failureRedirect: '/auth/apple/failure' }),
  (req, res) => {
    const at = createAccessToken({ userId: req.user._id });
    const rt = createRefreshToken({ userId: req.user._id });
    res.json({ success: true, data: { id: req.user._id, email: req.user.email, name: req.user.name, pseudo: req.user.pseudo, profilePic: req.user.profilePic }, tokens: { accessToken: at, refreshToken: rt } });
  }
);

export default router;


