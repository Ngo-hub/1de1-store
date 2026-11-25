// Passcode auth for Mission Control. Signed, httpOnly, 30-day cookie. Secret = OPERATOR_PASSCODE.
import crypto from 'crypto';

const MAXAGE = 60 * 60 * 24 * 30; // seconds
const secret = () => process.env.OPERATOR_PASSCODE || '';
const sign = (payload, s) => crypto.createHmac('sha256', s).update(payload).digest('hex');

export function passcodeSet() {
  return !!secret();
}

export function checkPasscode(input) {
  const s = secret();
  if (!s || !input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function makeToken() {
  const s = secret();
  if (!s) return '';
  const iat = Date.now().toString();
  return `${iat}.${sign(iat, s)}`;
}

export function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `ngo_auth=${token}; HttpOnly; Secure; Path=/; Max-Age=${MAXAGE}; SameSite=Lax`);
}

export function isAuthed(req) {
  const s = secret();
  if (!s) return false;
  const m = (req.headers.cookie || '').match(/ngo_auth=([^;]+)/);
  if (!m) return false;
  const [iat, sig] = decodeURIComponent(m[1]).split('.');
  if (!iat || !sig) return false;
  if (sign(iat, s) !== sig) return false;
  if (Date.now() - Number(iat) > MAXAGE * 1000) return false;
  return true;
}

// Returns true if ok; otherwise writes 401 and returns false.
export function requireAuth(req, res) {
  if (!isAuthed(req)) { res.status(401).json({ error: 'locked' }); return false; }
  return true;
}
