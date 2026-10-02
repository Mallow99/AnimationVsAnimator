// The AI brain (milestone 4). A language model plays him: it talks as him, and in
// "full" mode it also picks what he does next.
//
// It never moves his body. It can only pick from the same list of skills the
// instinct mind uses (see COMMANDS in mind.ts), and its words go in his speech
// bubble. Reflexes stay instant and offline: a poke still gets an immediate
// reaction from instinct; the brain may add a comment a second later.
//
// The model call itself happens in the desktop shell (it holds the API key).
// This file decides WHEN to ask, WHAT to tell the model, and what to do with
// the answer. `ask` is plugged in from outside, so the headless tests can use a fake.

import { COMMANDS, type Mind, type MindEvent } from './mind';
import type { MindMode } from './config';
import type { Ctx } from './skills';

export interface BrainTurn { role: 'user' | 'assistant'; text: string }
export interface BrainRequest { system: string; messages: BrainTurn[] }
export interface BrainReply { say: string; do: string }
export type AskFn = (req: BrainRequest) => Promise<BrainReply>;

/** Everything he can choose to do, plus "none". */
export const ACTIONS = ['none', ...COMMANDS.map((c) => c.name)];

/** The exact shape the model must answer in (JSON schema, enforced by the API). */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'What he says out loud, in his speech bubble. Empty string to stay quiet.' },
    do: { type: 'string', enum: ACTIONS, description: 'One action to do now, or "none".' },
  },
  required: ['say', 'do'],
  additionalProperties: false,
};

export interface LogLine { who: 'you' | 'him' | 'note'; text: string; at: number }

/** How often he thinks on his own in full mode, at most (seconds). */
const AUTO_EVERY = 40;
/** After something happens to him, he may comment — but not more often than this. */
const REACT_EVERY = 15;
/** Hard cap on model calls per hour, so a bug or a chatty mood can't run up a bill. */
const MAX_PER_HOUR = 120;
/** How many past messages he remembers in a conversation. */
const HISTORY = 16;

/** Notable things that happened to him, in words (what the model sees). */
function describe(e: MindEvent): string | null {
  switch (e.type) {
    case 'poked': return 'you poked him';
    case 'petted': return 'you petted him';
    case 'smacked': return 'you smacked him';
    case 'grabbed': return 'you picked him up';
    case 'released': return e.speed > 900 ? 'you threw him' : 'you put him down';
    case 'crashed': return 'he fell hard and hit the ground';
    case 'tripped': return 'he tripped and fell over';
    case 'fellOff': return 'he fell off a window';
    case 'reachedTop': return 'he climbed to the top of a wall';
    case 'letGo': return 'he let go of the wall';
    case 'landed': return e.speed > 600 ? 'he landed a big jump' : null;
    default: return null;
  }
}
/** Events worth a spoken reaction in full mode. */
const REACT_TO = new Set(['smacked', 'crashed', 'released', 'petted', 'reachedTop']);

/** Break a long reply into bubble-sized pieces at sentence or word boundaries. */
export function splitSpeech(text: string, max = 70): string[] {
  const out: string[] = [];
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*\s*/g) ?? [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).trim().length <= max) { cur += s; continue; }
    if (cur.trim()) out.push(cur.trim());
    cur = '';
    if (s.trim().length <= max) { cur = s; continue; }
    for (const w of s.trim().split(' ')) {
      if ((cur + ' ' + w).trim().length > max && cur.trim()) { out.push(cur.trim()); cur = ''; }
      cur = (cur + ' ' + w).trim();
    }
    cur += ' ';
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export class Brain {
  /** Set by the app when an AI provider is available (desktop only). */
  ask: AskFn | null = null;
  mode: MindMode = 'offline';
  name = 'Blurp';
  persona = '';
  /** The conversation so far, for the settings window. */
  log: LogLine[] = [];
  /** "thinking…", an error, or empty. */
  status = '';
  /** Words to show in his bubble (set by the pet). */
  onSpeak: (text: string) => void = () => {};

  private history: BrainTurn[] = [];
  private busy = false;
  private heard: string[] = [];
  private events: { text: string; at: number }[] = [];
  private calls: number[] = [];
  private nextAuto = 15;
  private nextReact = 0;
  private reactPending: string | null = null;

  get active() { return this.mode !== 'offline' && !!this.ask; }

  /** You typed something to him. */
  hear(c: Ctx, text: string) {
    text = text.trim().slice(0, 300);
    if (!text) return;
    this.addLog('you', text, c);
    if (!this.active) {
      this.addLog('note', this.mode === 'offline' ? 'His brain is set to Offline, so he can\'t understand words yet (Settings → General → Brain).' : 'No AI connected (add an API key in Settings → General → Brain).', c);
      c.say('?', 1.2);
      return;
    }
    this.heard.push(text);
  }

  /** Something happened to him. Remembered as context; in full mode he may comment on it. */
  noteEvent(c: Ctx, e: MindEvent) {
    const text = describe(e);
    if (!text) return;
    this.events.push({ text, at: c.world.time });
    if (this.events.length > 8) this.events.shift();
    if (this.mode === 'full' && REACT_TO.has(e.type)) this.reactPending = text;
  }

  update(c: Ctx, mind: Mind) {
    if (!this.active || this.busy) return;
    const now = c.world.time;
    if (this.heard.length) {
      const said = this.heard.join(' / ');
      this.heard = [];
      this.think(c, mind, `You hear: "${said}"`, 'you');
    } else if (this.mode === 'full' && this.reactPending && now >= this.nextReact) {
      const what = this.reactPending;
      this.reactPending = null;
      this.nextReact = now + REACT_EVERY;
      this.think(c, mind, `Something just happened: ${what}. React if you want (a few words), or stay quiet.`, 'event');
    } else if (this.mode === 'full' && now >= this.nextAuto && mind.idle && c.char.ready) {
      this.nextAuto = now + AUTO_EVERY;
      mind.holdUntil = now + 8; // give the brain a few seconds to decide before instinct takes over
      this.think(c, mind, 'Nobody said anything. Pick what to do next. Usually stay quiet; only speak if you have something worth saying.', 'auto');
    }
  }

  /** The stable part of the prompt: who he is and the rules. */
  systemPrompt() {
    const actions = COMMANDS.map((x) => `${x.name} (${x.label.toLowerCase()})`).join(', ');
    return [
      `You are ${this.name}. ${this.persona}`,
      '',
      'You live on the user\'s computer screen as a small animated stick figure (a desktop pet), in the spirit of Animator vs. Animation. Your body runs on physics: you walk, climb windows, fall, and get poked, petted, and thrown by the person\'s mouse cursor.',
      '',
      'How this works:',
      '- Each message from the person\'s side begins with a [state] block. That is what you sense and feel right now, not something the person said. What the person typed (if anything) comes after "You hear:".',
      '- You can\'t type, click, or use the computer. You act by choosing one action, or "none".',
      '- You talk in a small speech bubble. Keep "say" short: usually under 12 words, at most 2 short sentences. Plain text, no markdown, at most one emoji.',
      '- Your mood dials are real feelings. Let them color what you say and do: grumpy when annoyed, mopey when sad, short and sleepy when tired. You may refuse to do things when you\'re not in the mood.',
      '- If asked to do something you can\'t, say so in character. Never claim to have done something you didn\'t.',
      '- Stay in character. Don\'t mention being an AI or a language model unless the person asks directly.',
      '',
      `Actions you can choose: ${actions}.`,
      'Answer with JSON only, like {"say": "hi!", "do": "wave"}.',
    ].join('\n');
  }

  /** What he senses right now. */
  private stateBlock(c: Ctx, mind: Mind) {
    const m = c.mood, s = m.s, ch = c.char, w = c.world, now = w.time;
    const where = ch.isHeld() ? 'being held up in the air by your cursor'
      : ch.mode === 'climb' ? 'climbing the side of a window'
        : ch.mode === 'ceiling' ? 'hanging from the top of the screen'
          : ch.mode === 'air' ? 'flying through the air'
            : ch.mode === 'ragdoll' ? 'sprawled on the ground'
              : ch.support >= 0 ? 'standing on top of a window' : 'on the floor at the bottom of the screen';
    const cur = w.cursor;
    const cursor = !cur || now - w.cursorMovedAt > 60 ? 'the person hasn\'t moved the mouse in a while'
      : Math.hypot(cur.x - ch.x, cur.y - ch.body.j.head.y) < 200 ? 'the cursor is right next to you' : 'the cursor is somewhere on screen';
    const ago = (t: number) => { const d = Math.round(now - t); return d < 60 ? `${d}s ago` : `${Math.round(d / 60)} min ago`; };
    const recent = this.events.filter((e) => now - e.at < 600).map((e) => `${e.text} (${ago(e.at)})`).reverse().join('; ');
    const d = new Date();
    const f = (v: number) => v.toFixed(2);
    return [
      '[state]',
      `time: ${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      `mood: ${m.asleep ? 'asleep' : m.label} (happiness ${f(s.happiness)}, energy ${f(s.energy)}, boredom ${f(s.boredom)}, annoyance at the person ${f(s.annoyance)}, fear ${f(s.fear)}, trust in the person ${f(s.trust)})`,
      `doing: ${mind.skill?.name ?? 'nothing'}${mind.why ? ` (${mind.why})` : ''}`,
      `where: ${where}`,
      `cursor: ${cursor}`,
      `recently: ${recent || 'nothing much'}`,
      '[/state]',
    ].join('\n');
  }

  private think(c: Ctx, mind: Mind, prompt: string, why: 'you' | 'event' | 'auto') {
    const now = c.world.time;
    this.calls = this.calls.filter((t) => now - t < 3600);
    if (this.calls.length >= MAX_PER_HOUR) {
      if (why === 'you') { this.addLog('note', 'He\'s hit his limit of AI calls for this hour. Try again in a bit.', c); c.say('...', 1.2); }
      return;
    }
    this.calls.push(now);
    const user: BrainTurn = { role: 'user', text: `${this.stateBlock(c, mind)}\n${prompt}` };
    const req: BrainRequest = { system: this.systemPrompt(), messages: [...this.history, user] };
    this.busy = true;
    this.status = 'thinking…';
    this.ask!(req).then((reply) => {
      this.status = '';
      this.history.push(user, { role: 'assistant', text: JSON.stringify(reply) });
      while (this.history.length > HISTORY) this.history.splice(0, 2);
      this.apply(c, mind, reply, why);
    }, (err: unknown) => {
      this.status = err instanceof Error ? err.message : String(err);
      this.addLog('note', this.status, c);
      if (why === 'you') c.say('?', 1.2);
    }).finally(() => { this.busy = false; });
  }

  private apply(c: Ctx, mind: Mind, reply: BrainReply, why: 'you' | 'event' | 'auto') {
    const say = typeof reply.say === 'string' ? reply.say.trim() : '';
    const act = ACTIONS.includes(reply.do) ? reply.do : 'none';
    let did = '';
    if (act !== 'none') {
      const reason = why === 'you' ? 'you asked (AI)' : 'his own idea (AI)';
      if (mind.command(c, act, reason, true)) did = act;
    }
    if (why === 'auto') mind.holdUntil = 0;
    if (say) this.onSpeak(say);
    if (say || did || why === 'you') this.addLog('him', (say || '…') + (did ? `  [${did}]` : ''), c);
  }

  private addLog(who: LogLine['who'], text: string, c: Ctx) {
    this.log.push({ who, text, at: c.world.time });
    if (this.log.length > 40) this.log.shift();
  }
}
