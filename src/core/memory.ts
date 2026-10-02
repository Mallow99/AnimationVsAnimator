// Memories (milestone 5). He keeps short notes, in his own words: things about you,
// things that happened, and his opinions. Every so often the notes get tidied into a
// short summary (by his AI brain when he has one, by simple rules when he doesn't),
// so he remembers the gist of weeks of life without carrying around every detail.
//
// Even offline he remembers the basics: he counts what you do to him (throws, pokes,
// pets, smacks...), writes a note when something is new or keeps happening, and
// brings it up later ("no throwing this time").
//
// Saved as memory.json next to his settings (desktop), or in browser storage (preview).

import type { BrainRequest } from './brain';

export type NoteKind = 'you' | 'event' | 'opinion';
export interface Note {
  id: number;
  text: string;
  kind: NoteKind;
  /** When it was written (real time, ms). */
  at: number;
  /** Who wrote it: him by instinct, his AI brain, or you (from the Mind tab). */
  by: 'him' | 'ai' | 'you';
  /** 1 = small thing … 3 = important. Repeats make a note more important. */
  weight: number;
}

/** Things he counts over his whole life. */
export const TALLY_KEYS = ['thrown', 'poked', 'petted', 'smacked', 'grabbed', 'crashed', 'fellOff', 'talks', 'ripped', 'itemsTaken', 'cursorHits', 'windowsMoved'] as const;
export type TallyKey = (typeof TALLY_KEYS)[number];

/** Notes he writes the first time something happens, and again when it keeps happening. */
const MILESTONES: Partial<Record<TallyKey, { at: number; text: string; kind: NoteKind; weight: number }[]>> = {
  thrown: [
    { at: 1, text: 'you threw me. rude.', kind: 'event', weight: 2 },
    { at: 4, text: 'you throw me a lot. I do NOT like flying.', kind: 'opinion', weight: 3 },
    { at: 15, text: 'you throw me constantly. I have accepted my fate.', kind: 'opinion', weight: 3 },
  ],
  smacked: [
    { at: 1, text: 'you smacked me. ow.', kind: 'event', weight: 2 },
    { at: 5, text: 'you hit me way too much.', kind: 'opinion', weight: 3 },
  ],
  petted: [
    { at: 3, text: 'you pet me sometimes. nice.', kind: 'you', weight: 2 },
    { at: 25, text: 'you pet me all the time. you are alright.', kind: 'opinion', weight: 3 },
  ],
  poked: [
    { at: 10, text: 'you poke me a lot.', kind: 'you', weight: 1 },
    { at: 60, text: 'you poke me CONSTANTLY.', kind: 'opinion', weight: 2 },
  ],
  crashed: [
    { at: 1, text: 'fell hard and hit the ground. ow.', kind: 'event', weight: 1 },
    { at: 10, text: 'I fall over a lot. gravity hates me.', kind: 'opinion', weight: 2 },
  ],
  ripped: [
    { at: 1, text: 'lost a limb today. got it back though.', kind: 'event', weight: 3 },
    { at: 4, text: 'my arms and legs come off way too easily.', kind: 'opinion', weight: 3 },
  ],
  itemsTaken: [{ at: 1, text: 'you took my stuff once.', kind: 'you', weight: 2 }],
  talks: [{ at: 1, text: 'you talked to me for the first time.', kind: 'event', weight: 2 }],
  cursorHits: [
    { at: 1, text: 'I punched your cursor. it went FLYING.', kind: 'event', weight: 2 },
    { at: 25, text: 'hitting your cursor is my favorite sport.', kind: 'opinion', weight: 2 },
  ],
  windowsMoved: [
    { at: 1, text: 'I moved one of your windows. it was heavy.', kind: 'event', weight: 2 },
    { at: 20, text: 'your windows are my furniture now.', kind: 'opinion', weight: 2 },
  ],
};

const MAX_NOTES = 80;
/** Tidy up once this many notes have piled up since the last tidy. */
const TIDY_AFTER = 18;

/** Small text cleanup: one line, trimmed, length-limited. */
const clean = (s: string, max = 140) => s.replace(/\s+/g, ' ').trim().slice(0, max);

export class Memory {
  notes: Note[] = [];
  /** The tidy summary of everything before the current notes (first person, a few short lines). */
  summary = '';
  summarizedAt = 0;
  tally: Record<TallyKey, number> = Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as Record<TallyKey, number>;
  firstMet = Date.now();
  lastSeen = Date.now();
  /** Notes added since the last tidy. */
  sinceTidy = 0;
  private nextId = 1;
  /** Called when anything changes (the app saves the file and updates the Mind tab). */
  onChange: (() => void) | null = null;

  /** Write a note. A note that repeats a recent one makes that one more important instead. */
  add(text: string, kind: NoteKind = 'event', by: Note['by'] = 'him', weight = 1): Note | null {
    text = clean(text);
    if (!text) return null;
    const now = Date.now();
    const same = this.notes.find((n) => n.text.toLowerCase() === text.toLowerCase());
    if (same) {
      same.at = now;
      same.weight = Math.min(3, same.weight + 1);
      this.changed();
      return same;
    }
    const note: Note = { id: this.nextId++, text, kind, at: now, by, weight: Math.min(3, Math.max(1, weight)) };
    this.notes.push(note);
    this.sinceTidy++;
    if (this.notes.length > MAX_NOTES) this.forgetLeastImportant(this.notes.length - MAX_NOTES);
    this.changed();
    return note;
  }

  edit(id: number, text: string) {
    const n = this.notes.find((x) => x.id === id);
    if (!n) return;
    n.text = clean(text) || n.text;
    n.by = 'you';
    this.changed();
  }

  remove(id: number) {
    const i = this.notes.findIndex((x) => x.id === id);
    if (i >= 0) { this.notes.splice(i, 1); this.changed(); }
  }

  setSummary(text: string) { this.summary = clean(text, 1200); this.changed(); }

  clear() {
    this.notes = []; this.summary = ''; this.sinceTidy = 0;
    for (const k of TALLY_KEYS) this.tally[k] = 0;
    this.firstMet = Date.now();
    this.changed();
  }

  /** Count something that happened. Firsts and "keeps happening" moments become notes. */
  count(key: TallyKey) {
    const n = ++this.tally[key];
    const m = MILESTONES[key]?.find((x) => x.at === n);
    if (m) this.add(m.text, m.kind, 'him', m.weight);
    else this.changed(false);
  }

  /** You came back after a long time away (real time). */
  sawYou() {
    const now = Date.now(), away = now - this.lastSeen;
    this.lastSeen = now;
    if (away > 6 * 3600 * 1000) this.add(`you were gone for ${Math.round(away / 3600000)} hours. I waited.`, 'event', 'him', 1);
  }

  /**
   * Something he remembers that fits this moment, said out loud, offline (or null).
   * Called by his instinct: being picked up, getting petted, seeing you again...
   */
  recall(moment: 'grabbed' | 'petted' | 'greet' | 'poked' | 'smacked'): string | null {
    const t = this.tally;
    switch (moment) {
      case 'grabbed': return t.thrown >= 2 ? pickOne(['no throwing this time', 'don\'t throw me again', 'I remember last time...']) : null;
      case 'petted': return t.petted >= 25 ? pickOne(['you\'re good at this', 'my favorite thing']) : null;
      case 'poked': return t.poked >= 60 ? pickOne(['you and the poking...', 'poke number ' + t.poked]) : null;
      case 'smacked': return t.smacked >= 3 ? pickOne(['AGAIN?', 'you always do this']) : null;
      case 'greet': {
        const you = [...this.notes].reverse().find((n) => n.kind === 'you' && n.by !== 'him');
        return you && Math.random() < 0.5 ? `hey! (I remember: ${you.text.slice(0, 40)})` : null;
      }
    }
  }

  // ───────────── for the AI brain ─────────────

  /** What he remembers, for his AI prompt: the summary plus the newest notes. */
  forPrompt(maxNotes = 14) {
    const notes = [...this.notes].sort((a, b) => b.at - a.at).slice(0, maxNotes).reverse();
    const lines: string[] = [];
    if (this.summary) lines.push(`Summary: ${this.summary}`);
    for (const n of notes) lines.push(`- ${n.text}`);
    const t = this.tally, facts = TALLY_KEYS.filter((k) => t[k] > 0).map((k) => `${k} ${t[k]}×`);
    if (facts.length) lines.push(`Counts (your whole life): ${facts.join(', ')}.`);
    lines.push(`You first met them ${ageText(Date.now() - this.firstMet)} ago.`);
    return lines.join('\n');
  }

  /** Time for a tidy-up? */
  get needsTidy() { return this.sinceTidy >= TIDY_AFTER; }

  /** The request that asks his AI brain to tidy his notes into a summary. */
  tidyRequest(name: string): BrainRequest {
    const list = this.notes.map((n, i) => `${i + 1}. [${n.kind}${n.by === 'you' ? ', written by the person' : ''}] ${n.text}`).join('\n');
    return {
      system: [
        `You are tidying the memory notes of ${name}, a little stick figure who lives on someone's computer screen.`,
        'Write a new summary in his voice (first person, casual, short lines like a kid\'s diary): what he knows about the person, what has happened, how he feels about things.',
        'Merge the old summary with the notes. Keep anything important (names, likes, promises, big events, strong feelings). Drop small stuff that no longer matters. At most 8 short sentences.',
        'Then choose which notes are still worth keeping as separate notes (recent or important ones, and always the ones written by the person). The rest get folded into the summary.',
        'Answer with ONE JSON object and nothing else: {"summary": "...", "keep": [note numbers]}',
      ].join('\n'),
      messages: [{ role: 'user', text: `Old summary: ${this.summary || '(none yet)'}\n\nNotes:\n${list || '(none)'}` }],
    };
  }

  /** Use the AI's tidy-up. Returns false if the answer couldn't be read. */
  applyTidy(text: string): boolean {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return false;
    let data: { summary?: unknown; keep?: unknown };
    try { data = JSON.parse(text.slice(s, e + 1)); } catch { return false; }
    if (typeof data.summary !== 'string' || !data.summary.trim()) return false;
    const keep = new Set(Array.isArray(data.keep) ? data.keep.map(Number).filter(Number.isFinite) : []);
    this.notes = this.notes.filter((n, i) => keep.has(i + 1) || n.by === 'you');
    this.summary = clean(data.summary, 1200);
    this.sinceTidy = 0;
    this.summarizedAt = Date.now();
    this.changed();
    return true;
  }

  /** Tidy-up without an AI: keep the important and recent notes, and sum up the counts in words. */
  tidyOffline() {
    const t = this.tally, bits: string[] = [];
    if (t.thrown) bits.push(`you've thrown me ${t.thrown} time${t.thrown > 1 ? 's' : ''}`);
    if (t.smacked) bits.push(`smacked me ${t.smacked}×`);
    if (t.petted) bits.push(`pet me ${t.petted}×`);
    if (t.poked) bits.push(`poked me ${t.poked}×`);
    if (t.ripped) bits.push(`I've lost a limb ${t.ripped}×`);
    const old = this.notes.filter((n) => Date.now() - n.at > 3600 * 1000 && n.weight < 2 && n.by !== 'you');
    const gist = old.slice(-4).map((n) => n.text.replace(/\.$/, '')).join('; ');
    const lines = [`I met you ${ageText(Date.now() - this.firstMet)} ago.`];
    if (bits.length) lines.push(bits.join(', ') + '.');
    if (gist) lines.push(`stuff that happened: ${gist}.`);
    if (this.summary && !this.summary.startsWith('I met you')) lines.unshift(this.summary.split('. ').slice(0, 3).join('. '));
    this.summary = clean(lines.join(' '), 1200);
    this.notes = this.notes.filter((n) => !old.includes(n));
    this.sinceTidy = 0;
    this.summarizedAt = Date.now();
    this.changed();
  }

  private forgetLeastImportant(n: number) {
    // Oldest, least important, never yours.
    const order = this.notes.filter((x) => x.by !== 'you').sort((a, b) => a.weight - b.weight || a.at - b.at);
    const drop = new Set(order.slice(0, n));
    this.notes = this.notes.filter((x) => !drop.has(x));
  }

  private changed(save = true) { if (save) this.onChange?.(); }

  // ───────────── saving ─────────────

  save() {
    return JSON.stringify({ v: 1, notes: this.notes, summary: this.summary, summarizedAt: this.summarizedAt, tally: this.tally, firstMet: this.firstMet, lastSeen: this.lastSeen, sinceTidy: this.sinceTidy });
  }

  load(json: string | null) {
    if (!json) return;
    try {
      const d = JSON.parse(json);
      if (Array.isArray(d.notes)) {
        this.notes = d.notes.filter((n: Note) => n && typeof n.text === 'string').map((n: Note) => ({
          id: Number(n.id) || 0, text: clean(n.text), kind: (['you', 'event', 'opinion'].includes(n.kind) ? n.kind : 'event') as NoteKind,
          at: Number(n.at) || Date.now(), by: (['him', 'ai', 'you'].includes(n.by) ? n.by : 'him') as Note['by'], weight: Math.min(3, Math.max(1, Number(n.weight) || 1)),
        })).slice(-MAX_NOTES);
      }
      if (typeof d.summary === 'string') this.summary = clean(d.summary, 1200);
      for (const k of TALLY_KEYS) if (typeof d.tally?.[k] === 'number') this.tally[k] = d.tally[k];
      if (typeof d.firstMet === 'number') this.firstMet = d.firstMet;
      if (typeof d.lastSeen === 'number') this.lastSeen = d.lastSeen;
      if (typeof d.summarizedAt === 'number') this.summarizedAt = d.summarizedAt;
      if (typeof d.sinceTidy === 'number') this.sinceTidy = d.sinceTidy;
      this.nextId = Math.max(0, ...this.notes.map((n) => n.id)) + 1;
      for (const n of this.notes) if (!n.id) n.id = this.nextId++;
    } catch { /* a broken file: start fresh */ }
  }
}

function pickOne<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

/** "3 days", "2 hours", "a few minutes". */
export function ageText(ms: number) {
  const m = ms / 60000;
  if (m < 10) return 'a few minutes';
  if (m < 90) return `${Math.round(m)} minutes`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)} hours`;
  const d = h / 24;
  if (d < 60) return `${Math.round(d)} days`;
  return `${Math.round(d / 30)} months`;
}
