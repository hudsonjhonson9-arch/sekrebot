import crypto from 'node:crypto';

// Verifikasi initData Telegram Mini App (HMAC-SHA256).
// docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, botToken, { maxAgeSeconds = 86400 } = {}) {
  if (typeof initData !== 'string' || !initData.trim()) return { ok: false, reason: 'missing' };
  if (!botToken) return { ok: false, reason: 'bad_signature' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'malformed' };

  // HMAC data-check-string = semua field KECUALI hash. Field `signature`
  // (Ed25519, Bot API 7.2+) TETAP ikut: Telegram memasukkan seluruh field
  // selain hash saat menghitung HMAC. `signature` baru di-EXCLUDE untuk
  // skema validasi pihak ketiga (Ed25519), bukan di sini.
  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expected !== hash.toLowerCase()) return { ok: false, reason: 'bad_signature' };

  if (maxAgeSeconds > 0) {
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate)) return { ok: false, reason: 'malformed' };
    if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
      return { ok: false, reason: 'expired' };
    }
  }

  let raw;
  try {
    raw = JSON.parse(params.get('user'));
  } catch {
    return { ok: false, reason: 'no_user' };
  }
  if (!raw || !Number.isInteger(raw.id)) return { ok: false, reason: 'no_user' };

  return {
    ok: true,
    user: {
      id: raw.id,
      firstName: raw.first_name ?? null,
      lastName: raw.last_name ?? null,
      username: raw.username ?? null,
    },
  };
}