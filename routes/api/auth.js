import express from 'express';
import passport from 'passport';
import { register, login, refresh, forgotPassword, resetPassword } from '../../controllers/authController.js';
import { registerValidator, loginValidator } from '../../validators/authValidators.js';
import { createAccessToken, createRefreshToken } from '../../utils/token.js';

const router = express.Router();

// Registration and Login
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);

// Token refresh
router.post('/refresh', refresh);

// Password reset
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google OAuth
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

// Apple OAuth
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


