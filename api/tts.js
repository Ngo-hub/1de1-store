// Neural voice for the operator (ElevenLabs). Auth-gated. Returns mp3 audio.
// Degrades: returns 501 if ELEVENLABS_API_KEY is missing, so the page falls back to the browser voice.
import { requireAuth } from '../lib/auth.js';

export const config = { maxDuration: 30 };

// Default voice: "Daniel" — calm, refined British male (JARVIS-ish). Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = 'onwK4e9ZLuTAKqWW03F9';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(501).json({ error: 'tts not linked' });

  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'empty' });

  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: text.slice(0, 800),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('[tts]', r.status, detail);
      return res.status(502).json({ error: 'tts upstream', status: r.status, detail: detail.slice(0, 200) });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[tts]', e);
    return res.status(500).json({ error: String(e) });
  }
}
