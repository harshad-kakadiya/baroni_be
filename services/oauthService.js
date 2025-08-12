import User from '../models/User.js';

export const upsertOAuthUser = async (provider, profile) => {
  const providerId = profile.id;

  let query = {};
  if (provider === 'google') {
    query = { 'providers.google.id': providerId };
  } else if (provider === 'apple') {
    query = { 'providers.apple.id': providerId };
  }

  let user = await User.findOne(query);
  if (user) return user;

  const email = profile.emails?.[0]?.value?.toLowerCase();
  const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
  const profilePic = profile.photos?.[0]?.value;

  // if user exists by email, link provider
  if (email) {
    user = await User.findOne({ email });
    if (user) {
      if (provider === 'google') user.providers.google = { id: providerId };
      if (provider === 'apple') user.providers.apple = { id: providerId };
      if (!user.name && name) user.name = name;
      if (!user.profilePic && profilePic) user.profilePic = profilePic;
      await user.save();
      return user;
    }
  }

  const pseudoBase = (email?.split('@')[0] || name?.replace(/\s+/g, '').toLowerCase() || `user_${providerId}`).slice(0, 20);
  let pseudo = pseudoBase;
  let counter = 0;
  // ensure unique pseudo
  // eslint-disable-next-line no-await-in-loop
  while (await User.exists({ pseudo })) {
    counter += 1;
    pseudo = `${pseudoBase}${counter}`.slice(0, 25);
  }

  const newUser = await User.create({
    email,
    name,
    profilePic,
    pseudo,
    providers: {
      google: provider === 'google' ? { id: providerId } : undefined,
      apple: provider === 'apple' ? { id: providerId } : undefined,
    },
  });
  return newUser;
};


