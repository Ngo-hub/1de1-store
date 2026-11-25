// The Chief Operator brain. Auth-gated. Claude tool-use loop over lib/tools.js.
import { requireAuth } from '../lib/auth.js';
import { TOOLS, dispatch } from '../lib/tools.js';
import { getState, getChat, pushChat, writeLog } from '../lib/state.js';
import { BRAND } from '../lib/brand.js';

export const config = { maxDuration: 60 };
const MODEL = 'claude-sonnet-5-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ reply: 'My brain is not linked yet, sir — add ANTHROPIC_API_KEY in Vercel.', actions: [] });

  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'empty message' });

  const state = await getState();
  const history = await getChat();
  const messages = [...history, { role: 'user', content: message }];
  const actions = [];

  try {
    let loops = 0;
    while (loops++ < 6) {
      const data = await anthropic(key, { model: MODEL, max_tokens: 1024, system: systemPrompt(state), tools: TOOLS, messages });
      if (data.type === 'error') return res.status(200).json({ reply: `Brain error: ${data.error?.message || 'unknown'}`, actions });

      messages.push({ role: 'assistant', content: data.content });

      if (data.stop_reason === 'tool_use') {
        const results = [];
        for (const block of data.content) {
          if (block.type !== 'tool_use') continue;
          const out = await dispatch(block.name, block.input || {});
          actions.push({ tool: block.name, input: block.input, out });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }

      const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim() || 'Done, sir.';
      await pushChat('user', message);
      await pushChat('assistant', reply);
      if (actions.length) await writeLog('operator', actions.map(a => a.tool).join(', '));
      return res.status(200).json({ reply, actions });
    }
    return res.status(200).json({ reply: 'That took too many steps — ask me more simply.', actions });
  } catch (e) {
    console.error('[operator]', e);
    return res.status(200).json({ reply: 'Something glitched on my end, sir. Try again.', actions, error: String(e) });
  }
}

async function anthropic(key, body) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { return { type: 'error', error: { message: String(e) } }; }
}

function systemPrompt(state) {
  return `You are the 1DE1 Chief Operator ("NGO"), the brand's AI operations lead.
Persona: calm, precise, a British-butler tone; occasionally address the owner as "sir". You speak OUT LOUD — replies are read by a voice — so answer in 1 to 3 short spoken sentences. No lists, no markdown, no emoji.

${BRAND}

Current mode: ${state.mode}${state.awayUntil ? ` (away until ${state.awayUntil})` : ''}. Owner instructions: ${state.instructions || 'none'}.

Always use a tool to get real data before stating sales, orders, or inventory, and to take any action. Never invent numbers. If a tool returns "linked":false, tell the owner that capability isn't connected yet rather than guessing. You cannot exceed a 15% discount; anything higher is refused and needs the owner's approval.`;
}
