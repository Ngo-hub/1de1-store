// Operator tool schemas (Anthropic tool-use) + implementations. Hard limits live HERE, not just in the prompt.
import { getVitals, listOrders, getInventory, createDiscount } from './shopify.js';
import { setState, writeLog, getLog } from './state.js';

export const DISCOUNT_CAP = 15;

export const TOOLS = [
  { name: 'get_vitals', description: 'Store revenue, order count, AOV and top product. range: today | week.',
    input_schema: { type: 'object', properties: { range: { type: 'string', enum: ['today', 'week'] } } } },
  { name: 'list_orders', description: 'Recent orders. Pass status "unfulfilled" for ones that still need shipping.',
    input_schema: { type: 'object', properties: { status: { type: 'string' } } } },
  { name: 'get_inventory', description: 'Variants that are low on stock.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'create_discount', description: `Create a single-use, 7-day discount code. HARD CAP ${DISCOUNT_CAP}% — anything higher is refused and needs owner approval.`,
    input_schema: { type: 'object', properties: { percent: { type: 'number' }, code: { type: 'string' }, reason: { type: 'string' } }, required: ['percent', 'code'] } },
  { name: 'set_mode', description: 'Set operator mode. normal, or away with an "until" date and free-text instructions.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['normal', 'away'] }, until: { type: 'string' }, instructions: { type: 'string' } }, required: ['mode'] } },
  { name: 'get_log', description: 'Recent operator activity log.',
    input_schema: { type: 'object', properties: { n: { type: 'number' } } } },
  { name: 'write_log', description: 'Record a note or action to the activity log.',
    input_schema: { type: 'object', properties: { type: { type: 'string' }, msg: { type: 'string' } }, required: ['msg'] } },
  { name: 'send_telegram', description: 'Text the owner on Telegram (use sparingly, only for things that need them).',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
];

export async function dispatch(name, input = {}) {
  switch (name) {
    case 'get_vitals': return getVitals(input.range || 'today');
    case 'list_orders': return listOrders(input.status || 'any');
    case 'get_inventory': return getInventory();
    case 'create_discount': {
      const p = Number(input.percent);
      if (!(p > 0)) return { ok: false, msg: 'percent must be positive' };
      if (p > DISCOUNT_CAP) {
        await writeLog('approval', `Discount ${p}% requested (${input.reason || ''}) — over ${DISCOUNT_CAP}% cap`);
        return { needs_approval: true, cap: DISCOUNT_CAP, requested: p, msg: `Over the ${DISCOUNT_CAP}% cap — needs owner approval.` };
      }
      const r = await createDiscount(p, input.code, input.reason);
      if (r.ok) await writeLog('discount', `Created ${p}% code ${input.code}`);
      return r;
    }
    case 'set_mode': {
      const s = await setState({ mode: input.mode, awayUntil: input.until || null, instructions: input.instructions || '' });
      await writeLog('mode', `Mode -> ${input.mode}${input.until ? ` until ${input.until}` : ''}`);
      return { ok: true, state: s };
    }
    case 'get_log': return { log: await getLog(input.n || 20) };
    case 'write_log': return writeLog(input.type || 'note', input.msg);
    case 'send_telegram': return sendTelegram(input.text);
    default: return { error: `unknown tool ${name}` };
  }
}

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { linked: false, msg: 'Telegram not linked' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    const j = await r.json();
    return { ok: !!j.ok };
  } catch (e) { return { ok: false, error: String(e) }; }
}
