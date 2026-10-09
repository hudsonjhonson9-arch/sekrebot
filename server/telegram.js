import crypto from 'node:crypto';

// Verifikasi initData Telegram Mini App (HMAC-SHA256).
// docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Dua ketidakpastian historis di resolusi di sini dengan menerima SEMUA kombinasi
// yang pernah/sedang dipakai Telegram (karena tidak ada satu pun yang lemah, dan
// kombinasi yang salah = penolakan total terhadap klien yang sah):
//   1. Secret key: `SHA256(bot_token)` (skema lama) vs `HMAC_SHA256(key="WebAppData",
//      msg=bot_token)` (skema yang ditulis docs saat ini).
//   2. data-check-string: field `signature` (Ed25519, Bot API 7.2+) ikut vs dikecualikan.
// Set VERIFY_DEBUG=1 untuk melihat skema mana yang cocok per request di log server,
// lalu boleh di-persempit ke satu jalur.
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

  const entries = [...params.entries()].filter(([k]) => k !== 'hash');
  const includeSig = entries.map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const excludeSig = entries
    .filter(([k]) => k !== 'signature')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const shaSecret = crypto.createHash('sha256').update(botToken).digest();
  const webappSecret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

  const candidates = [
    { name: 'sha256+signature', secret: shaSecret, check: includeSig },
    { name: 'sha256-sans-signature', secret: shaSecret, check: excludeSig },
    { name: 'webappdata+signature', secret: webappSecret, check: includeSig },
    { name: 'webappdata-sans-signature', secret: webappSecret, check: excludeSig },
  ];

  const lowered = hash.toLowerCase();
  const matched = candidates.find(
    (c) => crypto.createHmac('sha256', c.secret).update(c.check).digest('hex') === lowered
  );
  if (!matched) return { ok: false, reason: 'bad_signature' };
  if (process.env.VERIFY_DEBUG) console.log('[verifyInitData] matched:', matched.name);

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