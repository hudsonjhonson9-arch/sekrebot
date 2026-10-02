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
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  if (m) return m[1];
  // Skema tanpa kredensial ("Bearer") ditolak; bentuk tanpa skema harus satu kata tanpa spasi.
  return /^\S+$/.test(raw) && !/^bearer$/i.test(raw) ? raw : null;
}