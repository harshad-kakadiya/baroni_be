import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import AppleStrategy from 'passport-apple';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { upsertOAuthUser } from '../services/oauthService.js';

dotenv.config();

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await upsertOAuthUser('google', profile);
          return done(null, user);
        } catch (err) {
          return done(err, undefined);
        }
      }
    )
  );
}

// Apple OAuth Strategy
if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY &&
  process.env.APPLE_CALLBACK_URL
) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKey: process.env.APPLE_PRIVATE_KEY.split(String.raw`\n`).join('\n'),
        callbackURL: process.env.APPLE_CALLBACK_URL,
        scope: ['name', 'email'],
      },
      async (accessToken, refreshToken, idToken, profile, done) => {
        try {
          // passport-apple provides profile with id and possibly email and name
          const user = await upsertOAuthUser('apple', profile);
          return done(null, user);
        } catch (err) {
          return done(err, undefined);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).lean();
    done(null, user);
  } catch (err) {
    done(err, undefined);
  }
});

export default passport;


