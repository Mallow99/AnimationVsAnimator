// The AI brain's connection to Claude. Runs in the main process only, so the API
// key never reaches the pet's page or the settings page.
//
// The key is saved in the app's data folder, encrypted with the operating
// system's keychain when available (Electron safeStorage). If you haven't saved
// one, the Anthropic SDK falls back to the ANTHROPIC_API_KEY environment variable.

import Anthropic from '@anthropic-ai/sdk';
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIONS, REPLY_SCHEMA, type BrainReply, type BrainRequest } from '../core/brain';

const keyPath = () => path.join(app.getPath('userData'), 'brain-key');
let cachedKey: string | null | undefined;
let client: Anthropic | null = null;

function loadKey(): string | null {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const raw = fs.readFileSync(keyPath());
    cachedKey = raw[0] === 0x50 /* "P" = plain */ ? raw.subarray(1).toString('utf8') : safeStorage.decryptString(raw.subarray(1));
  } catch { cachedKey = null; }
  return cachedKey;
}

/** Save (or with an empty string, forget) the API key. */
export function setKey(key: string) {
  key = key.trim();
  client = null;
  if (!key) { cachedKey = null; fs.rm(keyPath(), { force: true }, () => {}); return; }
  cachedKey = key;
  const enc = safeStorage.isEncryptionAvailable();
  const body = enc ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  fs.writeFileSync(keyPath(), Buffer.concat([Buffer.from(enc ? 'E' : 'P'), body]), { mode: 0o600 });
}

/** For the settings window: is a key set? Shows only the last 4 characters. */
export function keyStatus() {
  const k = loadKey();
  return { saved: !!k, hint: k ? `…${k.slice(-4)}` : '', fromEnv: !k && !!process.env.ANTHROPIC_API_KEY };
}

function getClient() {
  if (!client) {
    const key = loadKey();
    client = key ? new Anthropic({ apiKey: key, maxRetries: 1 }) : new Anthropic({ maxRetries: 1 });
  }
  return client;
}

// Server-side fallback (if the model declines for safety reasons, the API retries on
// a fallback model inside the same call) and `effort` aren't accepted by every model.
const SUPPORTS_FALLBACKS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);
const NO_EFFORT = /haiku/;

export type AskResult = { ok: true; reply: BrainReply } | { ok: false; error: string };

export async function ask(model: string, req: BrainRequest): Promise<AskResult> {
  if (!loadKey() && !process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'No API key yet. Add one in Settings → General → Brain.' };
  try {
    const res = await getClient().beta.messages.create({
      model,
      max_tokens: 4000, // includes his (short) thinking; the reply itself is tiny
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.text })),
      output_config: {
        format: { type: 'json_schema', schema: REPLY_SCHEMA },
        // He's chatting, not solving puzzles: low effort keeps replies quick and cheap.
        ...(NO_EFFORT.test(model) ? {} : { effort: 'low' as const }),
      },
      ...(SUPPORTS_FALLBACKS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') return { ok: true, reply: { say: '...', do: 'none' } };
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let reply: Partial<BrainReply>;
    try { reply = JSON.parse(text); } catch { return { ok: false, error: 'The AI answered in a form he couldn\'t read.' }; }
    return {
      ok: true,
      reply: { say: typeof reply.say === 'string' ? reply.say : '', do: ACTIONS.includes(reply.do ?? '') ? reply.do! : 'none' },
    };
  } catch (err) {
    // Most specific first.
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'The API key was rejected. Check it in Settings → General → Brain.' };
    if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, error: `This API key can't use the model "${model}".` };
    if (err instanceof Anthropic.NotFoundError) return { ok: false, error: `Unknown model "${model}". Check the model name in Settings.` };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Too many requests right now (rate limited). He\'ll try again later.' };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, error: `The API refused the request: ${err.message}` };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Couldn\'t reach the internet.' };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `AI error ${err.status ?? ''}: ${err.message}` };
    return { ok: false, error: String(err) };
  }
}
