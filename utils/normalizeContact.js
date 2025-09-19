export const normalizeContact = (raw) => {
  if (typeof raw !== 'string') return raw;
  // remove all whitespace characters
  const noSpaces = raw.replace(/\s+/g, '');
  return noSpaces;
};



