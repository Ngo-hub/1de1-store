// POST { passcode } -> sets signed httpOnly cookie if it matches OPERATOR_PASSCODE.
import { checkPasscode, makeToken, setAuthCookie, passcodeSet } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!passcodeSet()) return res.status(500).json({ error: 'OPERATOR_PASSCODE not set in Vercel' });
  const { passcode } = req.body || {};
  if (!checkPasscode(passcode)) return res.status(401).json({ error: 'wrong passcode' });
  setAuthCookie(res, makeToken());
  return res.status(200).json({ ok: true });
}
