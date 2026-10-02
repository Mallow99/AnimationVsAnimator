// The AI brain's connection to the outside world. Runs in the main process only,
// so API keys never reach the pet's page or the settings page.
//
// All the supported services (Google Gemini, Groq, OpenRouter) speak the same
// "OpenAI-compatible chat completions" format, so one plain web request covers
// them all — no extra libraries. Each service gets its own key, saved in the app's
// data folder and encrypted with the operating system's keychain when available.

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PROVIDERS, type ProviderId } from '../core/config';
import type { BrainRequest } from '../core/brain';

const keyPath = () => path.join(app.getPath('userData'), 'brain-keys');
let keys: Partial<Record<ProviderId, string>> | null = null;

function loadKeys() {
  if (keys) return keys;
  try {
    const raw = fs.readFileSync(keyPath());
    const text = raw[0] === 0x50 /* "P" = plain */ ? raw.subarray(1).toString('utf8') : safeStorage.decryptString(raw.subarray(1));
    keys = JSON.parse(text);
  } catch { keys = {}; }
  return keys!;
}

function saveKeys() {
  const text = JSON.stringify(keys ?? {});
  const enc = safeStorage.isEncryptionAvailable();
  const body = enc ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  fs.writeFileSync(keyPath(), Buffer.concat([Buffer.from(enc ? 'E' : 'P'), body]), { mode: 0o600 });
}

/** Save (or with an empty string, forget) the key for one service. */
export function setKey(provider: ProviderId, key: string) {
  const k = loadKeys();
  key = key.trim();
  if (key) k[provider] = key; else delete k[provider];
  saveKeys();
}

/** For the settings window: is a key saved for this service? Shows only the last 4 characters. */
export function keyStatus(provider: ProviderId) {
  const k = loadKeys()[provider];
  return { provider, saved: !!k, hint: k ? `…${k.slice(-4)}` : '' };
}

export type AskResult = { ok: true; text: string } | { ok: false; error: string };

function explain(status: number, body: string, provider: ProviderId, model: string): string {
  const name = PROVIDERS[provider].label;
  if (status === 401 || status === 403) return `${name} rejected the API key. Check it in Settings → General → Brain.`;
  if (status === 404) return `${name} doesn't know the model "${model}". Use "Find models" in Settings to pick one.`;
  if (status === 429) return `${name}'s free limit is used up for now (too many requests). He'll try again later.`;
  if (status >= 500) return `${name} is having trouble right now (error ${status}).`;
  return `${name} error ${status}: ${body.slice(0, 200)}`;
}

/** Services that refused JSON mode for a model: ask without it next time. */
const noJsonMode = new Set<string>();

export async function ask(provider: ProviderId, model: string, req: BrainRequest): Promise<AskResult> {
  const p = PROVIDERS[provider], key = loadKeys()[provider];
  if (!key) return { ok: false, error: `No ${p.label} key yet. Get a free one at ${p.keyUrl} and paste it in Settings → General → Brain.` };
  const send = (json: boolean) => fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.text }))],
      temperature: 0.9,
      max_tokens: 3000, // room for a made-up move (a list of poses) plus any thinking the model does
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });
  try {
    const tag = `${provider}:${model}`;
    let res = await send(!noJsonMode.has(tag));
    if (res.status === 400 && !noJsonMode.has(tag)) { noJsonMode.add(tag); res = await send(false); } // some models don't do JSON mode
    const body = await res.text();
    if (!res.ok) return { ok: false, error: explain(res.status, body, provider, model) };
    const text: string = JSON.parse(body)?.choices?.[0]?.message?.content ?? '';
    return text.trim() ? { ok: true, text } : { ok: false, error: 'The AI sent back an empty answer.' };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { ok: false, error: `${p.label} took too long to answer.` };
    return { ok: false, error: 'Couldn\'t reach the internet.' };
  }
}

/** Ask the service which models this key can use (so you don't have to guess names). */
export async function listModels(provider: ProviderId): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const p = PROVIDERS[provider], key = loadKeys()[provider];
  if (!key) return { ok: false, error: 'Save a key first.' };
  try {
    const res = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: explain(res.status, body, provider, '') };
    const data = JSON.parse(body)?.data ?? [];
    let ids: string[] = data.map((m: { id?: string }) => String(m.id ?? '').replace(/^models\//, '')).filter(Boolean);
    if (provider === 'openrouter') ids = ids.filter((id) => id.endsWith(':free')); // only the free ones
    if (provider === 'gemini') ids = ids.filter((id) => /gemini/.test(id) && !/embedding|image|tts|audio|live/.test(id));
    return { ok: true, models: ids.sort() };
  } catch {
    return { ok: false, error: 'Couldn\'t reach the internet.' };
  }
}
