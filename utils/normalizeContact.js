export const normalizeContact = (raw) => {
  if (typeof raw !== 'string') return raw;
  // remove all whitespace characters
  const noSpaces = raw.replace(/\s+/g, '');
  // remove a single leading '+' if present
  return noSpaces.startsWith('+') ? noSpaces.slice(1) : noSpaces;
};



