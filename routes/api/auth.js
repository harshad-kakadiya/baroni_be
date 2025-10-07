import express from 'express';
import passport from 'passport';
import {
    register,
    login,
    refresh,
    forgotPassword,
    resetPassword,
    completeProfile,
    me,
    checkUser,
    softDeleteAccount,
    permanentlyDeleteUser,
    getSoftDeletedUsers,
    toggleAvailableForBookings,
    updateFcmToken,
    updateApnsToken,
    updateVoipToken,
    updateDeviceType,
    updateIsDev,
    sendOtpController,
    logout,
} from '../../controllers/auth.js';
import { registerValidator, loginValidator, completeProfileValidator, checkUserValidator } from '../../validators/authValidators.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadMixed } from '../../middlewares/upload.js';
import { createAccessToken, createRefreshToken } from '../../utils/token.js';

const router = express.Router();

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refresh);
router.post('/check-user', checkUserValidator, checkUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/sent-otp', sendOtpController);

// OTP verification removed
router.post(
  '/complete-profile',
  requireAuth,
  uploadMixed.any(),
  completeProfileValidator,
  completeProfile
);
router.get('/me', requireAuth, me);

router.post('/delete-account', requireAuth, softDeleteAccount);

router.get('/delete-request', requireAuth, requireRole('admin'), getSoftDeletedUsers);

router.delete('/users/:userId', requireAuth, requireRole('admin'), permanentlyDeleteUser);

router.patch('/toggle-availability', requireAuth, toggleAvailableForBookings);
router.patch('/fcm-token', requireAuth, updateFcmToken);
router.patch('/apns-token', requireAuth, updateApnsToken);
router.patch('/voip-token', requireAuth, updateVoipToken);
router.patch('/device-type', requireAuth, updateDeviceType);
router.patch('/is-dev', requireAuth, updateIsDev);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/google/failure' }),
  (req, res) => {
    // Social login: bump sessionVersion so previous tokens become invalid
    req.user.sessionVersion = (typeof req.user.sessionVersion === 'number' ? req.user.sessionVersion : 0) + 1;
    req.user.save().catch(() => {});
    const at = createAccessToken({ userId: req.user._id, sessionVersion: req.user.sessionVersion });
    const rt = createRefreshToken({ userId: req.user._id, sessionVersion: req.user.sessionVersion });
    res.json({ success: true, data: { id: req.user._id, email: req.user.email, name: req.user.name, pseudo: req.user.pseudo, profilePic: req.user.profilePic }, tokens: { accessToken: at, refreshToken: rt } });
  }
);

router.get('/apple', passport.authenticate('apple'));
router.post(
  '/apple/callback',
  passport.authenticate('apple', { session: false, failureRedirect: '/auth/apple/failure' }),
  (req, res) => {
    req.user.sessionVersion = (typeof req.user.sessionVersion === 'number' ? req.user.sessionVersion : 0) + 1;
    req.user.save().catch(() => {});
    const at = createAccessToken({ userId: req.user._id, sessionVersion: req.user.sessionVersion });
    const rt = createRefreshToken({ userId: req.user._id, sessionVersion: req.user.sessionVersion });
    res.json({ success: true, data: { id: req.user._id, email: req.user.email, name: req.user.name, pseudo: req.user.pseudo, profilePic: req.user.profilePic }, tokens: { accessToken: at, refreshToken: rt } });
  }
);

export default router;


