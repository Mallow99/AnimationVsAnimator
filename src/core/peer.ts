// Another stick figure, as seen from this one.
//
// Today both figures live in one app, so a "peer" is simply the other Pet. Later each figure will be its
// own app (made in a "studio" app and handed out to friends), and they'll find each other and talk over a
// local connection. This file is the line between them: everything one figure knows about the other goes
// through a `FighterView` (a snapshot: where it is, what it's doing, its sword), and everything one does to
// the other is a `PeerMsg` (a hit landed, a challenge, a clash of blades). Nothing else crosses, so the same
// fight code works whether the other figure is in this app or another one. Both are plain data on purpose
// (no classes, no functions): they can be sent as JSON as they are.
import type { JointName } from './body';
import type { Mode } from './character';
import type { HitKind } from './fighting';
import type { V3, Vec } from './math';

export interface FighterView {
  id?: string;
  partner?: string | null;
  name: string;
  color: string;
  /** Doing something of his own that he wouldn't drop for a fight (a game, sleeping...). */
  busy: boolean;
  /** The skill he's running ('duel', 'idle'...), or null. */
  doing: string | null;
  x: number;
  facing: 1 | -1;
  mode: Mode;
  legCount: number;
  whole: boolean;
  scale: number;
  /** Every joint he still has, with depth. Hit tests run against these (see viewHitTest). */
  joints: Partial<Record<JointName, V3>>;
  headR: number;
  /** The attack he's in (a punch, a kick, a sword move), how far into it, whether it's still winding up, and
   * how long until it can hit (seconds: when to parry). */
  move: { name: string; u: number; windup: boolean; hitIn: number } | null;
  /** Fists up, or the sword held to block (and where). */
  guard: boolean;
  block: 'high' | 'mid' | 'low' | null;
  parrying: boolean;
  hitstun: number;
  stagger: number;
  hp: number;
  poise: number;
  /** His sword, if he's holding one: handle end, tip, and how fast the tip is moving. */
  blade: { a: V3; b: V3; speed: number; id: string } | null;
  /** He has a sword (in his hand or on his belt). */
  armed: boolean;
  /** Something the two of them are doing together (a high five, patty cake...), and how far along: going to
   * meet, in place and ready, or doing it. */
  social: { act: string; phase: 'meet' | 'ready' | 'do' } | null;
  asleep: boolean;
  /** His mood, in a word ('happy', 'angry'...): the other one reads it before asking him anything. */
  mood: string;
}

/** A weapon, as much as the one being hit needs to know about it. */
export interface WeaponInfo { id: string; hit: number; cuts: boolean }

export type PeerMsg =
  /** One of my hits reached you (`onBlade`: it met your sword, not you; `ranged`: an arrow, from afar). You decide what it does (blocked? parried? a cut?) and answer. */
  | { type: 'hit'; joint: JointName; vx: number; vy: number; power: number; weapon: WeaponInfo | null; at: Vec; kind: HitKind; onBlade?: boolean; ranged?: boolean }
  /** Your hit didn't land clean: blocked (I was guarding) or parried (and you're thrown off balance). */
  | { type: 'blocked'; parried: boolean; push: number; disarm: boolean }
  /** Our blades met mid-swing: both of us bounce off. */
  | { type: 'clash'; at: Vec; push: number }
  /** Square up! (with swords or without) */
  | { type: 'challenge'; armed: boolean }
  /** I'm fighting the cursor: come help. */
  | { type: 'backup'; angry: boolean }
  /** I'm down and out (or you are): the fight's over. Everyone slows down for a moment. */
  | { type: 'ko' }
  /** Want to do this together? (a handshake, a high five, a fist bump, patty cake, a hug) */
  | { type: 'invite'; act: string }
  /** The answer. */
  | { type: 'reply'; act: string; yes: boolean }
  /** We're both in place: starting now (both count the beats from when this arrives). */
  | { type: 'go'; act: string; topic?: number }
  /** Never mind (something came up). */
  | { type: 'cancel' }
  /** A line of small talk (TALK[topic] in skills/together.ts; -1 = just "hey!"): answer it. */
  | { type: 'talk'; topic: number }
  /** My shoulder into yours, on purpose (px/s): not a fight hit, just rude. */
  | { type: 'bump'; vx: number };

export interface Peer {
  /** A fresh snapshot of him. */
  view(): FighterView;
  /** Something from another figure (`from` is how to answer). */
  receive(msg: PeerMsg, from: Peer): void;
}
