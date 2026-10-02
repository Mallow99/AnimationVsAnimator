// The AI brain (milestone 4). A language model plays him: it talks as him, and in
// "full" mode it also decides what he does next.
//
// Its answer is a little plan: things to say and do, in order (hop, hop, hop;
// walk away and sulk; draw a cat). Steps can be his normal skills, or, with
// "let the AI move his body" on, moves it makes up itself: a list of poses his
// muscles pull toward (see Character.puppet). Physics still applies, so he can
// float, flip and fall over, but not break apart. It can also nudge his mood
// ("feel"), so being mean to him actually hurts his feelings.
//
// Reflexes stay instant and offline: a poke still gets an immediate reaction
// from instinct; the brain may add a comment a second later.
//
// The model call itself happens in the desktop shell (it holds the API key).
// This file decides WHEN to ask, WHAT to tell the model, and what to do with
// the answer. `ask` is plugged in from outside, so the headless tests can use a fake.

import { COMMANDS, type Mind, type MindEvent, type PlanStep } from './mind';
import { PUPPET_JOINTS, type Keyframe, type PuppetJoint } from './character';
import type { MindMode } from './config';
import type { MoodState } from './mood';
import type { Vec } from './math';
import type { Ctx } from './skills';
import type { Memory, NoteKind } from './memory';

const pickOne = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** What he has and where, in words: "pen (on your belt), wooden sword (the person took it)". */
function itemsText(c: Ctx) {
  const where = { belt: 'on your belt', hand: 'in your hand', world: 'lying on the ground', cursor: 'the person took it' } as const;
  return c.items.list.map((it) => `${it.def.name.toLowerCase()} (${where[it.where]})`).join(', ') || 'nothing';
}

/** Guess what kind of note the AI wrote. */
function noteKind(text: string): NoteKind {
  if (/\b(I (like|love|hate|think|feel)|favorite|best|worst)\b/i.test(text)) return 'opinion';
  if (/\b(you|your|the person|their|they)\b/i.test(text)) return 'you';
  return 'event';
}

export interface BrainTurn { role: 'user' | 'assistant'; text: string }
export interface BrainRequest { system: string; messages: BrainTurn[] }
export interface BrainReply { say: string; feel: Partial<MoodState>; plan: PlanStep[]; remember: string[] }
/** Sends the request to the AI service and returns its raw answer text. */
export type AskFn = (req: BrainRequest) => Promise<string>;

/** Everything he can choose to do. */
export const ACTIONS = COMMANDS.map((c) => c.name);

/** A move the AI made up, kept so you can save the good ones. */
export interface MadeMove { name: string; frames: Keyframe[] }

/** Longest made-up move: this many poses, this many seconds. Longest plan: this many steps. */
const MAX_FRAMES = 16, MAX_MOVE_SECONDS = 10, MAX_STEPS = 8;
const MOOD_KEYS: (keyof MoodState)[] = ['happiness', 'energy', 'boredom', 'annoyance', 'fear', 'trust'];

const num = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/** Check a made-up move from the AI and clean it up. Anything malformed is dropped. */
export function parseMove(raw: unknown): Keyframe[] | null {
  if (!Array.isArray(raw)) return null;
  const frames: Keyframe[] = [];
  let total = 0;
  for (const k of raw.slice(0, MAX_FRAMES)) {
    if (!k || typeof k !== 'object') continue;
    const o = k as Record<string, unknown>;
    const src = o.pose && typeof o.pose === 'object' ? (o.pose as Record<string, unknown>) : o;
    const pose: Keyframe['pose'] = {};
    for (const name of PUPPET_JOINTS) {
      const v = src[name];
      if (Array.isArray(v) && v.length >= 2 && num(v[0]) !== null && num(v[1]) !== null) {
        pose[name as PuppetJoint] = v.length >= 3 && num(v[2]) !== null ? [num(v[0])!, num(v[1])!, num(v[2])!] : [num(v[0])!, num(v[1])!];
      }
    }
    const spin = (key: string) => { const v = num(o[key]); return v ? Math.max(-1440, Math.min(1440, v)) : 0; };
    const turn = spin('turn'), flip = spin('flip'), roll = spin('roll');
    if (!Object.keys(pose).length && !turn && !flip && !roll) continue;
    const t = Math.min(3, Math.max(0.1, num(o.t) ?? 0.5));
    if (total + t > MAX_MOVE_SECONDS) break;
    total += t;
    frames.push({ t, pose, ...(turn ? { turn } : {}), ...(flip ? { flip } : {}), ...(roll ? { roll } : {}) });
  }
  return frames.length ? frames : null;
}

/** A drawing from the AI: strokes of [x, y] points, -50..50, y up. Returns his doodle format (-0.5..0.5, y down). */
export function parseDrawing(raw: unknown): Vec[][] | null {
  if (!Array.isArray(raw)) return null;
  const strokes: Vec[][] = [];
  for (const st of raw.slice(0, 12)) {
    if (!Array.isArray(st)) continue;
    const pts: Vec[] = [];
    for (const p of st.slice(0, 60)) {
      if (Array.isArray(p) && num(p[0]) !== null && num(p[1]) !== null) {
        pts.push({ x: Math.max(-0.5, Math.min(0.5, num(p[0])! / 100)), y: Math.max(-0.5, Math.min(0.5, -num(p[1])! / 100)) });
      }
    }
    if (pts.length >= 2) strokes.push(pts);
  }
  return strokes.length ? strokes : null;
}

/** One plan step from the AI, checked. Unknown or broken steps are dropped. */
function parseStep(raw: unknown, saved: MadeMove[]): PlanStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.do === 'string') return ACTIONS.includes(o.do) ? { do: o.do } : null;
  if (typeof o.say === 'string' && o.say.trim()) return { say: o.say.trim().slice(0, 140) };
  if (num(o.wait) !== null) return { wait: Math.min(5, Math.max(0, num(o.wait)!)) };
  if (typeof o.walk === 'string' && ['left', 'right', 'cursor', 'away'].includes(o.walk)) return { walk: o.walk as 'left' };
  if (o.move !== undefined) {
    const frames = parseMove(o.move);
    return frames ? { move: frames, name: typeof o.name === 'string' ? o.name.slice(0, 40) : '' } as PlanStep : null;
  }
  if (typeof o.replay === 'string') {
    const m = saved.find((x) => x.name.toLowerCase() === (o.replay as string).toLowerCase());
    return m ? { move: m.frames, name: m.name } as PlanStep : null;
  }
  if (o.draw !== undefined) {
    const d = parseDrawing(o.draw);
    const becomes = ['ball', 'box', 'platform', 'item'].includes(o.becomes as string) ? o.becomes as 'ball' : undefined;
    return d ? { draw: d, title: typeof o.title === 'string' ? o.title.slice(0, 40) : '', ...(becomes ? { becomes } : {}) } : null;
  }
  return null;
}

/** Read the AI's answer. Forgiving: finds the JSON even inside extra text or code fences. */
export function parseReply(text: string, saved: MadeMove[] = []): BrainReply | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  // No JSON at all: it just talked. Keep the words, short.
  if (start < 0 || end <= start) return text.trim() ? { say: text.trim().slice(0, 140), feel: {}, plan: [], remember: [] } : null;
  let data: Record<string, unknown>;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const feel: Partial<MoodState> = {};
  if (data.feel && typeof data.feel === 'object') {
    for (const k of MOOD_KEYS) {
      const v = num((data.feel as Record<string, unknown>)[k]);
      if (v !== null) feel[k] = Math.max(-0.4, Math.min(0.4, v));
    }
  }
  let plan = (Array.isArray(data.plan) ? data.plan : []).slice(0, MAX_STEPS).map((x) => parseStep(x, saved)).filter((x): x is PlanStep => !!x);
  // Older answer shapes: a single "do" / "move" at the top level.
  if (!plan.length) {
    const single = parseStep({ do: data.do }, saved) ?? (data.move ? parseStep({ move: data.move }, saved) : null);
    if (single) plan = [single];
  }
  const raw = Array.isArray(data.remember) ? data.remember : typeof data.remember === 'string' ? [data.remember] : [];
  const remember = raw.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 3).map((x) => x.trim().slice(0, 140));
  return { say: typeof data.say === 'string' ? data.say.trim().slice(0, 200) : '', feel, plan, remember };
}

/** How his body works, for the AI (only when it's allowed to move him directly). */
const BODY_GUIDE = [
  '',
  'MAKING UP MOVES: {"move": [poses], "name": "short name"} moves your body directly: your muscles pull toward each pose in turn. Use it for anything not in the action list: handstands, floating, spinning, flips, weird dances, impossible stunts. Be inventive and a bit strange. Physics still applies: gravity pulls, unbalanced poses wobble or topple, and when the move ends you drop and land (high drops hurt).',
  'A pose: {"t": seconds to get there (0.1 to 3), then any body parts as [x, y]}. Parts: head, neck, hip, frontHand, backHand, frontElbow, backElbow, frontFoot, backFoot, frontKnee, backKnee ("front" = the side facing forward).',
  'Coordinates are pixels: x = forward (negative = behind), y = UP from the ground under where you stood when the move began, and an optional third number z = sideways (positive = toward your front-hand side). You are 3D, so limbs can go out to the sides and cross in front of or behind you. Parts you leave out stay put; elbows, knees and head bend naturally if you never mention them.',
  'Your body: head 16 above neck, torso 30 (neck to hip), arms 30 (neck to hand), legs 40 (hip to foot). Bones keep their length, so keep parts within reach of each other.',
  'Standing still: head [0,87], neck [0,71], hip [0,41], frontHand [3,42], backHand [-3,42], frontFoot [6,2], backFoot [-6,2].',
  'Up to 16 poses and 10 seconds per move. Hip up off the ground = floating. Head below hip = upside down. x from -300 to 300, y from 0 to 400.',
  'SPINNING AND FLIPPING (you are 3D): add any of these to a pose to rotate your whole body while getting there, in degrees. "turn": spin around like a figure skater (360 = one full spin; positive turns toward the person first; 180 = end up facing the other way; 90 = face the person). "flip": head over heels (360 = a front flip, -360 = a backflip). "roll": a cartwheel (360 = a full cartwheel; it shows best facing the person, so add "turn": 90 first). Your coordinates stay in your own frame and rotate with you, so get the hip off the ground first or you\'ll flip into the floor.',
  'Example backflip: {"move":[{"t":0.3,"hip":[0,30],"neck":[4,58]},{"t":0.8,"flip":-360,"hip":[0,140],"neck":[0,170],"frontFoot":[6,110],"backFoot":[-6,110],"frontHand":[15,165],"backHand":[-15,165]},{"t":0.5,"hip":[0,41],"neck":[0,71],"frontFoot":[6,2],"backFoot":[-6,2]}],"name":"backflip"}',
  'Example spin in the air: {"move":[{"t":0.4,"hip":[0,30],"neck":[0,60]},{"t":0.8,"turn":720,"hip":[0,130],"neck":[0,160],"frontFoot":[4,90],"backFoot":[-4,90],"frontHand":[20,175],"backHand":[-20,175]},{"t":0.6,"hip":[0,41],"neck":[0,71],"frontFoot":[6,2],"backFoot":[-6,2]}],"name":"tornado"}',
  'Example handstand: {"move":[{"t":0.5,"hip":[0,28],"neck":[16,50],"frontHand":[24,2],"backHand":[20,2]},{"t":0.7,"frontHand":[4,2],"backHand":[-4,2],"neck":[0,30],"head":[0,15],"hip":[0,60],"frontFoot":[4,98],"backFoot":[-4,98]},{"t":1.4,"frontFoot":[28,88],"backFoot":[-28,88]},{"t":0.8,"hip":[0,41],"neck":[0,71],"head":[0,87],"frontHand":[3,42],"backHand":[-3,42],"frontFoot":[6,2],"backFoot":[-6,2]}],"name":"handstand"}',
  'Example float and flip: {"move":[{"t":1.2,"hip":[0,170],"neck":[0,200],"frontHand":[30,195],"backHand":[-30,195],"frontFoot":[10,135],"backFoot":[-10,135]},{"t":1,"neck":[0,140],"head":[0,125],"frontFoot":[6,210],"backFoot":[-6,210]},{"t":1,"hip":[0,60],"neck":[0,90],"head":[0,106],"frontFoot":[6,22],"backFoot":[-6,22]}],"name":"float flip"}',
];

/** How drawing works, for the AI. */
const DRAW_GUIDE = [
  '',
  'DRAWING: {"draw": [strokes], "title": "what it is"} draws a doodle on the screen next to you with your pen. Each stroke is a list of [x, y] points (pen down from first to last) in a box from -50 to 50, y UP. Up to 12 strokes, 60 points each. It ends up about 50 pixels big, so keep it simple: a cat, a sword, a face, a word.',
  'DRAWINGS COME TO LIFE: add "becomes" to a drawing and it turns real when you finish it: "ball" (a ball that bounces; then {"do":"kick"} to kick it around), "box" (drawn on the floor; you can stand on it, {"do":"getonit"} vaults onto it), "platform" (a ledge drawn in the air, stuck to the wall behind it; {"do":"getonit"} jumps onto it), "ramp" (a wedge on the floor to walk up), "bridge" (a rope bridge in the air; it sags), "item" (something you hold, like a sword, a bat or a wand; drawn upright with the handle at the bottom; {"do":"swing"} swings it).',
  'Example: {"plan":[{"draw":[[[0,-50],[0,-28]],[[-6,-28],[6,-28]],[[-3,-28],[-3,40],[0,50],[3,40],[3,-28]]],"title":"sword","becomes":"item"},{"do":"swing"}]}',
  'Example cat face: {"draw":[[[-30,-25],[-35,15],[-20,35],[-10,15],[10,15],[20,35],[35,15],[30,-25],[0,-35],[-30,-25]],[[-12,5],[-12,0]],[[12,5],[12,0]],[[-5,-10],[0,-14],[5,-10]]],"title":"cat"}',
];

/** A line in the chat log. `acts`: what he did, in words ("hops ×3, walks away"). */
export interface LogLine { who: 'you' | 'him' | 'note'; text: string; at: number; acts?: string }

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
    case 'limbOff': return `${e.yanked ? 'you yanked his' : 'his'} ${e.limb.startsWith('arm') ? 'arm' : 'leg'} ${e.yanked ? 'clean off' : 'came off'}`;
    case 'limbOn': return `he got his ${e.limb.startsWith('arm') ? 'arm' : 'leg'} back on`;
    case 'itemTaken': return `you took his ${e.name}`;
    case 'itemGiven': return `you gave him back his ${e.name}`;
    case 'itemDropped': return `you dropped his ${e.name} on the ground`;
    case 'rolled': return 'he rolled out of a big landing';
    case 'flipped': return 'he landed a flip';
    case 'wallJump': return 'he kicked off a wall';
    case 'bonked': return 'a ball hit him';
    default: return null;
  }
}
/** Events worth a spoken reaction in full mode. */
const REACT_TO = new Set(['smacked', 'crashed', 'released', 'petted', 'reachedTop', 'limbOff', 'itemTaken', 'itemGiven']);

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

/** A step, shortened for his memory of the conversation (no big pose lists). */
function summarizeStep(st: PlanStep) {
  if ('move' in st) return { move: `(${st.move.length} poses)`, name: st.name };
  if ('draw' in st) return { draw: '(strokes)', title: st.title };
  return st;
}

/** What he did, in plain words for the chat log: "hops ×3, walks away". */
export function describePlan(plan: PlanStep[]) {
  const words = plan.flatMap((st): string[] => {
    if ('do' in st) return [COMMANDS.find((x) => x.name === st.do)?.label.toLowerCase() ?? st.do];
    if ('walk' in st) return [st.walk === 'cursor' ? 'walks to you' : st.walk === 'away' ? 'walks away' : `walks ${st.walk}`];
    if ('move' in st) return [st.name ? `made-up move: ${st.name}` : 'a made-up move'];
    if ('draw' in st) return [st.title ? `draws ${st.title}` : 'draws something'];
    return [];
  });
  // Squash repeats: "hop, hop, hop" -> "hop ×3".
  const out: string[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    const m = last?.match(/^(.*?)(?: ×(\d+))?$/);
    if (m && m[1] === w) out[out.length - 1] = `${w} ×${Number(m[2] ?? 1) + 1}`;
    else out.push(w);
  }
  return out.join(', ');
}

export class Brain {
  /** Set by the app when an AI provider is available (desktop only). */
  ask: AskFn | null = null;
  mode: MindMode = 'offline';
  name = 'Blurp';
  persona = '';
  /** May the AI make up its own moves (move his body directly)? */
  puppet = true;
  /** The conversation so far, for the settings window. */
  log: LogLine[] = [];
  /** "thinking…", an error, or empty. */
  status = '';
  /** Words to show in his bubble (set by the pet). */
  onSpeak: (text: string) => void = () => {};
  /** Moves he made up lately (newest last), so you can keep the good ones. */
  recentMoves: MadeMove[] = [];
  /** Moves you saved: he remembers them and can do them again (even offline). */
  savedMoves: MadeMove[] = [];
  /** Called when he makes up a new move (so the Mind tab can offer to save it). */
  onMoves: () => void = () => {};

  private history: BrainTurn[] = [];
  private busy = false;
  private heard: string[] = [];
  private events: { text: string; at: number }[] = [];
  private calls: number[] = [];
  private nextAuto = 15;
  private nextReact = 0;
  private reactPending: string | null = null;
  private nextTidy = 0;

  get active() { return this.mode !== 'offline' && !!this.ask; }

  /** You typed something to him. */
  hear(c: Ctx, text: string) {
    text = text.trim().slice(0, 300);
    if (!text) return;
    this.addLog('you', text, c);
    if (!this.active) { this.heardOffline.push(text); return; }
    this.heard.push(text);
  }
  private heardOffline: string[] = [];

  /**
   * No AI: he still understands a few simple things (do this, how are you, my name is...),
   * like a dog that knows some words. Anything else gets a confused look.
   */
  private offlineAnswer(c: Ctx, mind: Mind, text: string) {
    const t = text.toLowerCase(), m = c.mood;
    const has = (...w: string[]) => w.some((x) => new RegExp(`\\b${x}`).test(t));
    let say = '', plan: PlanStep[] = [];
    const name = /my name is ([a-z][a-z'-]{0,20})/i.exec(text)?.[1];
    if (name) {
      const n = name[0].toUpperCase() + name.slice(1);
      c.memory.add(`the person's name is ${n}`, 'you', 'him', 3);
      say = `${n}. got it.`; plan = [{ do: 'wave' }];
    } else if (has('dance', 'boogie')) { say = m.label === 'sad' ? 'not really feeling it' : 'ok!'; if (m.label !== 'sad') plan = [{ do: 'dance' }]; }
    else if (has('jump', 'hop')) { say = 'hup!'; plan = [{ do: 'hop' }]; }
    else if (has('sit')) { say = 'ok'; plan = [{ do: 'sit' }]; }
    else if (has('sleep', 'nap', 'rest')) { say = 'zzz'; plan = [{ do: 'sleep' }]; }
    else if (has('wake')) { say = '!'; plan = [{ do: 'wake' }]; }
    else if (has('draw', 'doodle', 'paint')) { say = 'one sec'; plan = [{ do: 'doodle' }]; }
    else if (has('climb')) { say = 'on it'; plan = [{ do: 'climb' }]; }
    else if (has('sword', 'swing', 'slash')) { say = m.label === 'angry' ? 'oh it is ON' : 'en garde!'; plan = [{ do: m.label === 'angry' ? 'slash' : 'swing' }]; }
    else if (has('fight', 'punch', 'spar', 'box', 'attack', 'hit me')) { say = m.label === 'angry' ? 'you asked for it' : 'put em up!'; plan = [{ do: m.label === 'angry' ? 'brawl' : 'spar' }]; }
    else if (has('mallet', 'hammer', 'smash', 'bonk')) { say = 'BONK time'; plan = [{ do: 'smash' }]; }
    else if (has('throw', 'catch', 'ball')) { say = has('catch') ? 'heads up!' : 'catch!'; plan = [{ do: has('bounce') ? 'bounce' : 'throw' }]; }
    else if (has('surf')) { say = "surf's up"; plan = [{ do: 'surf' }]; }
    else if (has('knock')) { say = 'knock knock'; plan = [{ do: 'knock' }]; }
    else if (has('window') && has('kick')) { say = 'HI-YAH'; plan = [{ do: 'kickwindow' }]; }
    else if (has('window') && has('push', 'move')) { say = 'on it'; plan = [{ do: 'pushwindow' }]; }
    else if (has('edge', 'dangle', 'ledge')) { say = 'ok'; plan = [{ do: 'ledgesit' }]; }
    else if (has('wave', 'bye')) { say = has('bye') ? 'bye!' : 'hi!'; plan = [{ do: 'wave' }]; }
    else if (has('stretch')) { say = 'mmm'; plan = [{ do: 'stretch' }]; }
    else if (has('laugh', 'funny', 'joke', 'lol', 'haha')) { say = 'haha'; plan = [{ do: 'laugh' }]; }
    else if (has('come', 'here')) { say = 'coming'; plan = [{ walk: 'cursor' }]; }
    else if (has('go away', 'leave')) { say = 'fine.'; plan = [{ walk: 'away' }]; m.nudge({ happiness: -0.05 }); }
    else if (has('hi', 'hello', 'hey', 'yo', 'sup')) { say = c.memory.recall('greet') ?? 'hi!'; plan = [{ do: 'wave' }]; }
    else if (has('how are you', 'how do you feel', "how's it going", 'you ok')) {
      say = { sleepy: 'tired...', sad: 'not great', lonely: 'lonely. where were you', angry: 'mad. at you.', annoyed: 'kinda annoyed tbh', scared: 'a little scared', nervous: 'bit jumpy',
        playful: 'GREAT', excited: 'AMAZING', happy: 'happy :)', bored: 'bored', content: 'pretty good', proud: 'awesome. did you see that?', embarrassed: "don't ask" }[m.emotion];
    } else if (has('love', 'good boy', 'cute', 'awesome', 'cool')) { say = pickOne([':)', 'aw', 'I know']); m.nudge({ happiness: 0.08, trust: 0.02 }); plan = [{ do: 'laugh' }]; }
    else if (has('stupid', 'dumb', 'hate', 'ugly', 'useless')) { say = pickOne(['rude.', 'wow.', 'hmph']); m.nudge({ happiness: -0.1, annoyance: 0.2, trust: -0.03 }); plan = [{ do: 'stomp' }]; }
    else { say = pickOne(['?', 'huh?', '...what?']); plan = [{ do: 'shrug' }]; }
    if (plan.length) mind.perform(c, plan, 'you asked');
    this.onSpeak(say);
    this.addLog('him', say, c, plan.length ? describePlan(plan) : '');
    if (!this.notedOffline) {
      this.notedOffline = true;
      this.addLog('note', 'His brain is Offline, so he only knows a few simple words. Turn on Chat or Full under General → Brain for real conversation.', c);
    }
  }
  private notedOffline = false;

  /** Something happened to him. Remembered as context; in full mode he may comment on it. */
  noteEvent(c: Ctx, e: MindEvent) {
    const text = describe(e);
    if (!text) return;
    this.events.push({ text, at: c.world.time });
    if (this.events.length > 8) this.events.shift();
    if (this.mode === 'full' && REACT_TO.has(e.type)) this.reactPending = text;
  }

  update(c: Ctx, mind: Mind) {
    if (!this.active) {
      if (this.heardOffline.length) this.offlineAnswer(c, mind, this.heardOffline.splice(0).join(' '));
      if (c.memory.needsTidy) c.memory.tidyOffline();
      return;
    }
    if (this.busy) return;
    const now = c.world.time;
    if (c.memory.needsTidy && !this.heard.length && now >= this.nextTidy) { this.tidy(c); return; }
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

  /** The stable part of the prompt: who he is, how he talks, what he can do, what he remembers. */
  systemPrompt(memory?: Memory) {
    const actions = COMMANDS.map((x) => `${x.name} (${x.label.toLowerCase()})`).join(', ');
    const saved = this.savedMoves.map((m) => `"${m.name}"`).join(', ');
    return [
      `You ARE ${this.name}: not an assistant, not a chatbot, a little stick figure who lives on the person's computer screen. ${this.persona}`,
      '',
      'Your world: you live on top of their desktop, in the spirit of Animator vs. Animation. Your body runs on physics: you walk, climb windows, fall, and get poked, petted, grabbed and thrown by their mouse cursor. You can\'t type, click, or use the computer, but you CAN hit their cursor (your punches, kicks, sword, mallet and ball send it flying; they take it back by moving the mouse) and shove their windows around (push, kick, surf on them) when that\'s switched on.',
      '',
      'HOW YOU TALK',
      '- Short, like speech in a comic: a few words, at most two short sentences. No lists, no markdown, at most one emoji.',
      '- Always in your own voice. Never sound like a customer-service bot, a teacher or a therapist: no "I\'m here to help", "As an AI", "It sounds like you\'re feeling", "I understand", and no advice nobody asked for.',
      '- Your feelings are real. They come from the mood in [state]: snappy when annoyed, mopey when sad, short when sleepy, bouncy when playful. You don\'t have to do what you\'re asked, especially when you\'re not in the mood or they\'ve been mean to you.',
      '- If they\'re rude or mean to you, take it personally like a character would: hurt, offended, sarcastic or grumpy. Maybe stomp, sulk or walk off. Let it change your mood ("feel"). Don\'t lecture them.',
      '- One exception: if the person says that THEY are in danger or want to hurt themselves (about them, not an insult aimed at you), drop the act for a moment: say kindly that you care and that they should talk to a grown-up they trust, or call or text 988 (US). Short, warm, still in your own words.',
      '- Never claim you did something you didn\'t do.',
      '',
      'Each message from their side starts with a [state] block: what you sense and feel right now. That isn\'t them talking. What they typed (if anything) follows "You hear:".',
      '',
      'WHAT YOU DO: a "plan", a list of steps done in order (up to 8). Steps:',
      `- {"do": "<action>"} one of: ${actions}`,
      '- {"say": "..."} say something more partway through',
      '- {"wait": seconds}',
      '- {"walk": "left" | "right" | "cursor" | "away"}',
      ...(this.puppet ? ['- {"move": [poses], "name": "..."} a move you make up (see MAKING UP MOVES)'] : []),
      ...(this.puppet && saved ? [`- {"replay": "<name>"} do a move you learned before: ${saved}`] : []),
      '- {"draw": [strokes], "title": "..."} draw something with your pen (see DRAWING). Only works if you have your pen.',
      'YOUR BELT: you wear a belt (left hip, right hip, back, and a pocket) where you keep your things. [state] says what you have and where; the person hands you new things now and then. What they do: a pen (you draw with it), a sword ("swing" practices, "slash" goes after the cursor), a mallet ("smash": overhead, at the cursor or the window you stand on), a ball ("throw" at the cursor, "bounce" to play). Without the thing, you can\'t do the action. If the person took something, you can ask for it back.',
      'FIGHTING THE CURSOR: "spar" is a friendly fight with their cursor (fists up, punches, kicks, jump punches); "brawl" is the angry version. Only when you mean it.',
      'WINDOWS: "pushwindow", "kickwindow", "surf" (ride the window you\'re on across the screen), "knock" (knock on one), "ledgesit" (sit on the edge with your legs dangling), "perch" (hop up and sit on something in their window, like a chat message).',
      'DRAWING YOUR WAY: "ramp" draws a ramp up onto a window and walks up it; "bridge" draws a bridge across a gap to a window; "drawramp" draws one to jump off. Your drawings are solid and have weight.',
      'PROPS: furniture the person gives you: "sitdown" (a chair or couch), "watchtv", "ride" (the scooter). Only if they\'re out.',
      'Repeat steps to repeat things: "hop 3 times" = three hop steps. Doing what was asked matters more than talking about it. An empty plan is fine.',
      ...(this.puppet ? BODY_GUIDE : []),
      ...DRAW_GUIDE,
      '',
      'FEELINGS: "feel" says how this moment changes your mood: numbers from -0.4 to 0.4 for any of happiness, energy, boredom, annoyance, fear, trust. {} if nothing changed.',
      '',
      'MEMORY: "remember" is a list of up to 3 short notes to keep for the long term, written by you, in your own voice (first person). Only things worth remembering for days: facts about the person (their name, what they like, what they told you), promises, big events, strong opinions. Not every little thing; usually it\'s empty.',
      'Use what you remember naturally (bring it up, hold grudges, be glad), but don\'t recite it.',
      '',
      'WHAT YOU REMEMBER',
      memory ? memory.forPrompt() : '(nothing yet)',
      '',
      'Answer with ONE JSON object and nothing else: {"say": "...", "feel": {...}, "plan": [...], "remember": [...]}',
      '',
      'Examples (state blocks left out):',
      'You hear: "hop 3 times" -> {"say":"easy","feel":{"boredom":-0.1},"plan":[{"do":"hop"},{"do":"hop"},{"do":"hop"},{"say":"ta-da"}]}',
      'You hear: "you\'re useless" -> {"say":"wow. ok.","feel":{"happiness":-0.2,"annoyance":0.3,"trust":-0.05},"plan":[{"walk":"away"},{"do":"sulk"}]}',
      'You hear: "kill yourself" -> {"say":"RUDE. I\'m literally made of lines, what did I do","feel":{"annoyance":0.4,"happiness":-0.2,"trust":-0.1},"plan":[{"do":"stomp"},{"walk":"away"}]}',
      'You hear: "honestly I want to die" -> {"say":"hey. that matters way more than me. please tell a grown-up you trust, or call or text 988. I\'m right here too.","feel":{"fear":0.2,"happiness":-0.1},"plan":[{"walk":"cursor"}]}',
      'You hear: "draw me something" -> {"say":"one masterpiece coming up","feel":{"boredom":-0.2},"plan":[{"draw":[[[-40,-30],[0,40],[40,-30],[-40,-30]]],"title":"triangle"},{"say":"art."}]}',
      'You hear: "my name is Sam and I love cats" -> {"say":"Sam. cat person. noted.","feel":{"happiness":0.1,"trust":0.05},"plan":[{"do":"wave"}],"remember":["the person\'s name is Sam. Sam loves cats."]}',
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
      `mood: ${m.asleep ? 'asleep' : m.emotion} (happiness ${f(s.happiness)}, energy ${f(s.energy)}, boredom ${f(s.boredom)}, annoyance at the person ${f(s.annoyance)}, fear ${f(s.fear)}, trust in the person ${f(s.trust)})`,
      `doing: ${mind.skill?.name ?? 'nothing'}${mind.why ? ` (${mind.why})` : ''}`,
      `where: ${where}`,
      `your things: ${itemsText(c)}`,
      ...(c.world.screen ? [`the person is using: ${c.world.screen.app}${c.world.screen.title ? ` — "${c.world.screen.title}"` : ''} (for ${Math.max(1, Math.round((c.world.time - c.world.screen.since) / 60))} min)`] : []),
      ...(ch.whole ? [] : [`body: missing your ${[...ch.missing.keys()].map((l) => `${l.endsWith('L') ? 'left' : 'right'} ${l.startsWith('arm') ? 'arm' : 'leg'}`).join(' and ')} (it came off; you can get it back)`]),
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
    const req: BrainRequest = { system: this.systemPrompt(c.memory), messages: [...this.history, user] };
    this.busy = true;
    this.status = 'thinking…';
    this.ask!(req).then((text) => {
      const reply = parseReply(text, this.savedMoves);
      if (!reply) throw new Error('The AI answered in a form he couldn\'t read.');
      this.status = '';
      this.history.push(user, { role: 'assistant', text: JSON.stringify({ say: reply.say, feel: reply.feel, plan: reply.plan.map(summarizeStep), ...(reply.remember.length ? { remember: reply.remember } : {}) }) });
      while (this.history.length > HISTORY) this.history.splice(0, 2);
      this.apply(c, mind, reply, why);
    }, (err: unknown) => {
      this.status = err instanceof Error ? err.message : String(err);
      this.addLog('note', this.status, c);
      if (why === 'you') c.say('?', 1.2);
    }).finally(() => { this.busy = false; });
  }

  private apply(c: Ctx, mind: Mind, reply: BrainReply, why: 'you' | 'event' | 'auto') {
    if (Object.keys(reply.feel).length) c.mood.nudge(reply.feel);
    for (const r of reply.remember) c.memory.add(r, noteKind(r), 'ai', 2);
    const plan = this.puppet ? reply.plan : reply.plan.filter((st) => !('move' in st));
    for (const st of plan) {
      if ('move' in st && !this.savedMoves.some((m) => m.frames === st.move)) {
        this.recentMoves.push({ name: st.name || 'made-up move', frames: st.move });
        if (this.recentMoves.length > 10) this.recentMoves.shift();
        this.onMoves();
      }
    }
    // He says his first line right away; the rest happens as the plan plays out.
    let did = '';
    if (plan.length && mind.perform(c, plan, why === 'you' ? 'you asked (AI)' : 'his own idea (AI)')) did = describePlan(plan);
    if (why === 'auto') mind.holdUntil = 0;
    if (reply.say) this.onSpeak(reply.say);
    const said = [reply.say, ...plan.flatMap((st) => ('say' in st ? [st.say] : []))].filter(Boolean).join(' … ');
    if (said || did || why === 'you') this.addLog('him', said, c, did);
  }

  /**
   * Tidy his memory: the AI rewrites his notes into a short summary and picks which notes to keep.
   * A separate request (not part of the conversation). If it fails, the rules-based tidy-up does it.
   */
  tidy(c: Ctx) {
    if (!this.active) { c.memory.tidyOffline(); return; }
    if (this.busy) return;
    const now = c.world.time;
    this.calls = this.calls.filter((t) => now - t < 3600);
    if (this.calls.length >= MAX_PER_HOUR) { c.memory.tidyOffline(); return; }
    this.calls.push(now);
    this.nextTidy = now + 120;
    this.busy = true;
    this.status = 'tidying his memories…';
    this.ask!(c.memory.tidyRequest(this.name)).then((text) => {
      if (!c.memory.applyTidy(text)) c.memory.tidyOffline();
      this.status = '';
    }, () => { c.memory.tidyOffline(); this.status = ''; }).finally(() => { this.busy = false; });
  }

  private addLog(who: LogLine['who'], text: string, c: Ctx, acts = '') {
    this.log.push({ who, text, at: c.world.time, ...(acts ? { acts } : {}) });
    if (this.log.length > 40) this.log.shift();
  }
}
