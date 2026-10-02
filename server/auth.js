export function parseToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('_');
  if (parts.length < 3 || parts[0] !== 'usr') return null;
  const id = Number(parts[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Header tanpa skema ("usr_1_2") juga diterima; skema selain "bearer" ditolak.
export function bearerToken(req) {
  const raw = (req.headers?.authorization || '').trim();
  if (!raw) return null;
  const sp = raw.indexOf(' ');
  if (sp === -1) return raw;
  return raw.slice(0, sp).toLowerCase() === 'bearer' && raw.slice(sp + 1).trim() ? raw.slice(sp + 1).trim() : null;
}