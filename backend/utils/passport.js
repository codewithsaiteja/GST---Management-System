const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { User } = require('./db');
require('dotenv').config();

async function findOrCreateUser(profile, providerField) {
  let email = profile.emails?.[0]?.value?.toLowerCase() || null;
  let name = profile.displayName || profile.username || 'OAuth User';
  let user = await User.findOne({ [providerField]: profile.id });
  if (user) return user;
  if (email) {
    user = await User.findOne({ email });
    if (user) { user[providerField] = profile.id; await user.save(); return user; }
  }
  if (!email) email = `${profile.id}@${providerField}.local`;
  return await User.create({ name, email, [providerField]: profile.id, role: 'accountant', active: 1 });
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  }, async (at, rt, profile, done) => {
    try { return done(null, await findOrCreateUser(profile, 'googleId')); }
    catch(err) { return done(err, null); }
  }));
} else { console.warn('Google OAuth disabled: Missing credentials'); }

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: '/api/auth/facebook/callback',
    profileFields: ['id', 'displayName', 'emails']
  }, async (at, rt, profile, done) => {
    try { return done(null, await findOrCreateUser(profile, 'facebookId')); }
    catch(err) { return done(err, null); }
  }));
} else { console.warn('Facebook OAuth disabled: Missing credentials'); }

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/api/auth/github/callback',
    scope: ['user:email']
  }, async (at, rt, profile, done) => {
    try { return done(null, await findOrCreateUser(profile, 'githubId')); }
    catch(err) { return done(err, null); }
  }));
} else { console.warn('GitHub OAuth disabled: Missing credentials'); }

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
