// Skill contracts and shared movement helper. No platform APIs.
import type { Character, Keyframe } from '../character';
import type { FighterView, PeerMsg } from '../peer';
import type { Mood } from '../mood';
import type { Bounds, Platform } from '../physics';
import type { Wall, WinRect } from '../world';
import type { Doodle } from '../doodles';
import type { Props } from '../props';
import type { Vec } from '../math';
import type { Memory } from '../memory';
import type { Items } from '../items';
import type { BoardGame } from '../board-game';

export type LookMode = 'default' | 'cursor' | 'away' | 'down' | 'none' | 'target';

export interface World {
  bounds: Bounds;
  cursor: Vec | null;
  cursorMovedAt: number; // world.time when the cursor last moved
  time: number;          // seconds since start
  platforms: Platform[]; // window tops he can stand on
  walls: Wall[];         // window sides and screen edges he can climb
  windows: WinRect[];    // the windows on screen (front-most first), where they are right now
  sides: Wall[];         // every visible window side, at any height (for pushing and kicking them)
  /** What you're doing: the app in front, its window's title, since when (world.time). Null if he can't tell. */
  screen?: { app: string; title: string; since: number } | null;
  /** Things in your front window he can stand on (text, buttons, chat messages): their top edges. */
  uiTops?: Platform[];
}

/** Things he has learned from experience. Saved between runs. */
export interface Lessons {
  /** Biggest drop (px, at size 1) he's willing to jump down. Shrinks when a jump down hurts him. */
  safeDrop: number;
}
export const DEFAULT_LESSONS: Lessons = { safeDrop: 420 };

/** Everything a skill can see and touch. */
export interface Ctx {
  /** Which figure this is (unique while the app runs): who's sitting where, who's watching the TV. */
  who: string;
  char: Character;
  mood: Mood;
  world: World;
  look: LookMode;
  lessons: Lessons;
  say(text: string, secs?: number): void;
  /** Drawings on screen (shared with the renderer). */
  doodles: Doodle[];
  /** Ink color for his pen. */
  inkColor: string;
  /** Move the real mouse cursor (only in mischief mode on a desktop). Returns false if not allowed. */
  moveCursor(x: number, y: number): boolean;
  /** Set when you yank the cursor back while he's holding it. */
  cursorEscaped: boolean;
  /** Mischief mode is on and this desktop can move the cursor. */
  canGrabCursor: boolean;
  /** He finished a drawing (the pet keeps it in his gallery). */
  onDrawn?: (d: Doodle) => void;
  /** Moves he learned (made up by his AI brain, kept by you). He can show them off on his own. */
  savedMoves?: { name: string; frames: Keyframe[] }[];
  /** His notes about you and his life (milestone 5). */
  memory: Memory;
  /** What he looks at when `look` is 'target'. */
  lookTarget?: Vec | null;
  /** His belt and everything on it (and anything you took). */
  items: Items;
  /** A sound effect (the app plays it). */
  sound?: (name: string, strength?: number) => void;
  /** His sword (or mace, or ball) hit your cursor, moving at (vx, vy) px/s. `power` 0..1+. */
  hitCursor?: (x: number, y: number, vx: number, vy: number, power: number) => void;
  /** He's allowed to move your windows (setting on, desktop, and it's been working). */
  canMoveWindows?: boolean;
  /** A specific protected/stubborn window is paused briefly; other windows still work. */
  canMoveWindow?: (id: number) => boolean;
  /** Shove a window (px/s). `spring`: it wobbles and settles back where it was (a knock, a stomp). */
  shoveWindow?: (id: number, vx: number, vy: number, spring?: boolean) => boolean;
  /** Keep a window sliding at vx px/s right now (he's pushing it). */
  pushWindow?: (id: number, vx: number) => boolean;
  /** Is this window still moving (he shoved it)? */
  windowMoving?: (id: number) => boolean;
  /** Grab onto your cursor with his front hand and hang from it (if it's right there). */
  hangOnCursor?: () => boolean;
  /** He's allowed to play with your cursor (hit it, hang off it): the "He can hit your cursor" setting. */
  cursorPlay?: boolean;
  /** Can he move windows right now, and if not, why not. */
  windowMoves?: 'ok' | 'off' | 'unsupported' | 'stuck';
  /** Drawings that came to life: balls, boxes, ledges. */
  props?: Props;
  game?: BoardGame;
  /** His friend (the other stick figure on screen), if there is one: a snapshot (see peer.ts). */
  foe?: () => FighterView | null;
  /** Send his friend a message (see peer.ts). */
  tell?: (m: PeerMsg) => void;
  /** How he feels about his friend: -1 (can't stand him) … 1 (best friends). Saved with him. */
  feel: { bond: number };
  /** Loose an arrow from (x, y) at (vx, vy) px/s. `at`: what it's meant for (his friend, or your cursor). */
  shoot?: (x: number, y: number, vx: number, vy: number, at: 'friend' | 'cursor') => void;
  /** A little burst of sparks (hands slapping together), and hearts (a hug). */
  burst?: (x: number, y: number, n: number) => void;
  hearts?: (x: number, y: number) => void;
  /** How fights with his friend go: play (foam and wooden swords) or real (katanas that cut). */
  fightMode?: 'play' | 'real';
  /** A finished drawing comes to life (the pet turns it into a ball, a box, an item...). */
  onBecome?: (d: Doodle) => void;
}

export abstract class Skill {
  abstract readonly name: string;
  t = 0;
  start(_c: Ctx) {}
  /** Called every frame. Return true when finished. */
  abstract update(c: Ctx, dt: number): boolean;
  stop(_c: Ctx) {}
}

export function arrive(c: Ctx, x: number, tol = 8) {
  const ch = c.char;
  if (!ch.ready || ch.walking) return false;
  // (Never tighter than where his own walking calls it "there", or he'd stop short and wait forever.)
  if (Math.abs(ch.x - x) <= Math.max(tol, 6) * ch.scale) return true;
  // Up on a piece of furniture (or something he drew) and the spot's past its edge: he hops down rather than
  // waiting at the edge forever. (Off a window, getting down is its own skill.)
  const offProp = ch.support >= 0 && !!c.props?.thingOf(ch.support);
  ch.walkTo(x, Math.abs(x - ch.x) > 200, offProp);
  return false;
}
