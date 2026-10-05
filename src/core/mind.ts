// The offline mind ("Mode 0"): instinct, no AI.
//
// Two jobs:
//   1. When he's free, pick the next skill. Each option gets a score from his
//      mood, then we roll weighted dice — so he's predictable in spirit but
//      never on rails.
//   2. React to what happens to him (pokes, grabs, throws, crashes, petting).
//      The SAME poke gets a different reaction depending on how he feels.
//
// Later an LLM mind can sit on top of this: same skills, same mood, it just
// gets a say in the choices and adds real words.

import type { CharEvent, Gesture, Keyframe } from './character';
import { LIVE_SHAPES, type Becomes } from './doodles';
import type { Vec } from './math';
import type { MoodState } from './mood';
import { chance, pick, rand, sign } from './math';
import {
  Chain, routeTo, Brawl, HangCursor, DrawRamp, BridgeTo, rampPlan, bridgePlan, SitOnProp, WatchTV, PlayVideoGame, RideScooter, PlayBoardGame, PaintCanvas, Duel, propsOf, ThrowItem, PushWindow, KickWindow, WindowSurf, KnockWindow, LedgeSit, windowSidesAtHand,
  AskBack, KickBall, onDrawnBlock, WallJump, wallJumpTarget, type DrawPlace, AvoidCursor, ChaseCursor, FetchItem, PuppetMove, Reattach, SwordSwing, ClimbOnto, climbDownOption, DoodleSkill, dropFrom, GetDown, GrabCursor, MonkeyBars, Idle, presets, reachableAbove, Sequence, SitFor, Skill, Sleep, Wander, type Ctx,
} from './skills';
import { AskTogether, isAct, NapTogether, ShoulderBump, Together, WaveAt, type Act } from './skills/together';
import { DrawTool } from './skills/draw-tool';
import { ShootGun } from './skills/gun';
import { DesktopInteraction } from './skills/desktop';
import { ShootBow } from './skills/archery';
import type { FighterView } from './peer';

export type MindEvent = CharEvent | { type: 'poked' } | { type: 'petted' } | { type: 'smacked'; speed: number }
  | { type: 'itemTaken'; name: string } | { type: 'itemGiven'; name: string } | { type: 'itemDropped'; name: string; uid: number }
  | { type: 'itemSpawned'; name: string; uid: number } // something new appeared (you dropped it in from his inventory)
  | { type: 'propSpawned'; id: string; name: string }   // a prop (a chair, a TV...) dropped in
  | { type: 'hitByFriend'; name: string; power: number; cut: boolean; stabbed: boolean; play: boolean; ko?: boolean } // his friend hit him
  | { type: 'wasParried'; name: string } // his friend parried his hit: he's off balance
  | { type: 'invited'; act: string; name: string }   // his friend wants to do something together (a high five...)
  | { type: 'replied'; act: string; yes: boolean; name: string } // ...and the answer to his own asking
  | { type: 'socialCancel'; name: string }           // his friend backed out
  | { type: 'bumped'; name: string }                 // his friend shouldered him on purpose
  | { type: 'disarmed'; name: string }   // ...and his sword went flying
  | { type: 'friendFighting'; angry: boolean } // his friend squared up to your cursor: back him up
  | { type: 'blocked'; name: string } // he blocked his friend's hit
  | { type: 'challenged'; name: string; armed: boolean } // his friend squared up to him
  | { type: 'appChanged'; app: string; title: string }  // you switched to another app
  | { type: 'bonked'; speed: number } // a ball hit him
  | { type: 'hitCursor'; power: number; by: string } // he hit your cursor (and maybe sent it flying)
  | { type: 'cursorFreed' }   // you took your cursor back mid-flight
  | { type: 'parried' }       // he blocked your smack
  | { type: 'windowStuck' };  // he tried to move a window and it wouldn't budge

interface Option { name: string; score: number; why: string; make: () => Skill }

const cur0 = (w: { cursor: Vec | null }) => w.cursor !== null;

/** What kind of thing you're doing, from the app's name and its window's title. */
export function appKind(app: string, title: string) {
  const a = `${app} ${title}`.toLowerCase();
  if (/minecraft/.test(a)) return 'minecraft';
  if (/youtube|netflix|twitch|disney\+|hulu|prime video|crunchyroll|vlc|iina|quicktime/.test(a)) return 'video';
  if (/discord|messages|slack|whatsapp|telegram|signal|teams|messenger|instagram|snapchat|imessage/.test(a)) return 'chat';
  if (/canvas|classroom|google docs|docs\.google|quizlet|khan|word|pages|notion|homework|assignment|essay/.test(a)) return 'school';
  if (/visual studio|vs ?code|code|xcode|terminal|iterm|cursor|intellij|pycharm|sublime|github/.test(a)) return 'code';
  if (/steam|roblox|fortnite|epic games|valorant|league of legends|game/.test(a)) return 'game';
  if (/spotify|music|soundcloud|apple music/.test(a)) return 'music';
  if (/safari|chrome|firefox|arc|edge|brave|opera/.test(a)) return 'browser';
  return 'other';
}
const APP_LINES: Record<string, string[]> = {
  video: ['what are we watching?', 'is it a cartoon?', 'can I watch too?', 'ooh. show.'],
  chat: ['who are you talking to?', 'say hi from me', 'ooh. gossip?', 'tell them about me'],
  school: ['homework?', 'you got this', "I won't distract you. (I will)", 'study time huh'],
  code: ["coding? I'm made of code, you know", 'fix any bugs?', 'make me cooler while you are in there', 'is that me in there'],
  game: ['ooh can I play?', "don't die", 'gamer time'],
  minecraft: ['MINECRAFT', 'build me a house!', 'watch out for creepers', 'punch a tree for me'],
  music: ['♪ good song?', 'turn it up', '♪♪'],
  browser: ['what are you looking up?', 'so many tabs...', 'googling stuff?'],
};

/** One step of a plan (from his AI brain): done in order. */
export type PlanStep =
  | { do: string; with?: string }
  | { say: string }
  | { wait: number }
  | { walk: 'left' | 'right' | 'cursor' | 'away' }
  | { move: Keyframe[]; name?: string }
  | { draw: Vec[][]; title?: string; becomes?: Becomes; place?: DrawPlace };

/** Runs a plan: each step's skill to the end, then the next. */
class PlanSkill extends Skill {
  private i = -1;
  private sub: Skill | null = null;
  private waitLeft = 0;
  private settle = 0;
  constructor(private mind: Mind, private steps: PlanStep[]) { super(); }
  /** Shows as whatever step he's on ("hop", "move", ...). */
  get name() { return this.sub?.name ?? 'plan'; }

  update(c: Ctx, dt: number): boolean {
    if (this.sub) {
      this.sub.t += dt;
      if (!this.sub.update(c, dt)) return false;
      this.sub.stop(c);
      this.sub = null;
    }
    if (this.waitLeft > 0) { this.waitLeft -= dt; return false; }
    // Body steps need him on his feet; give him a moment to get there.
    const next = this.steps[this.i + 1];
    if (next && !('say' in next) && !('wait' in next) && !(c.char.ready || c.char.mode === 'sit')) {
      this.settle += dt;
      return this.settle > 6;
    }
    this.settle = 0;
    if (++this.i >= this.steps.length) return true;
    const st = this.steps[this.i];
    if('do' in st && st.with){const peer=c.peers?.().find(p=>p.id===st.with || p.name.toLowerCase()===st.with!.toLowerCase());if(!peer?.id || !c.selectPeer?.(peer.id)){c.say('I cannot find that friend.',1.5);return false;}}
    if ('say' in st) { c.say(st.say); this.waitLeft = Math.min(3, 0.8 + st.say.length * 0.04); return false; }
    if ('wait' in st) { this.waitLeft = Math.min(5, Math.max(0, st.wait)); return false; }
    const sub = 'do' in st ? this.mind.makeSkill(c, st.do)
      : 'move' in st ? new PuppetMove(st.move)
        : 'draw' in st ? new DoodleSkill(st.draw, st.title, { becomes: st.becomes, place: st.place ?? (st.becomes === 'box' || st.becomes === 'ramp' ? 'floor' : st.becomes === 'platform' || st.becomes === 'bridge' ? 'air' : 'front') })
          : new Sequence('walk', [{ walkTo: this.walkTarget(c, st.walk) }]);
    if (sub) { this.sub = sub; sub.start(c); }
    return false;
  }

  private walkTarget(c: Ctx, w: 'left' | 'right' | 'cursor' | 'away') {
    const x = c.char.x, cur = c.world.cursor;
    if (w === 'cursor') return cur ? cur.x : x;
    if (w === 'away') return x - sign((cur?.x ?? x + 1) - x) * rand(200, 350);
    return x + (w === 'left' ? -1 : 1) * rand(150, 300);
  }

  stop(c: Ctx) { this.sub?.stop(c); this.sub = null; }
}

/** What finishing an activity does to his mood. Gives his feelings real causes. */
const AFTERGLOW: Record<string, Partial<MoodState>> = {
  dance: { boredom: -0.3, happiness: 0.06, energy: -0.04 },
  hop: { boredom: -0.1, happiness: 0.02, energy: -0.02 },
  chase: { boredom: -0.35, happiness: 0.05, energy: -0.05 },
  explore: { boredom: -0.25 },
  monkeybars: { boredom: -0.4, happiness: 0.06, energy: -0.06 },
  doodle: { boredom: -0.3, happiness: 0.05 },
  grabcursor: { boredom: -0.4, happiness: 0.08, annoyance: -0.1 },
  wander: { boredom: -0.1 },
  climb: { boredom: -0.25, happiness: 0.05 },
  getdown: { boredom: -0.05 },
  stretch: { energy: 0.03 },
  sit: { energy: 0.03, boredom: 0.03 },
  sulk: { happiness: 0.06, annoyance: -0.15 },
  tantrum: { annoyance: -0.25 },
  hunt: { annoyance: -0.15, energy: -0.04 },
  sleep: { happiness: 0.06 },
  reattach: { happiness: 0.08, fear: -0.1 },
  swing: { boredom: -0.25, annoyance: -0.2, happiness: 0.03 },
  walljump: { boredom: -0.35, happiness: 0.05, energy: -0.04 },
  kick: { boredom: -0.3, happiness: 0.05, energy: -0.03 },
  drawball: { boredom: -0.3, happiness: 0.05 }, drawbox: { boredom: -0.3, happiness: 0.04 }, drawledge: { boredom: -0.25 }, drawsword: { annoyance: -0.15 },
  backflip: { boredom: -0.25, happiness: 0.04, energy: -0.03 },
  frontflip: { boredom: -0.25, happiness: 0.04, energy: -0.03 },
  roll: { boredom: -0.1 },
  pickup: { boredom: -0.05 },
  spar: { boredom: -0.4, happiness: 0.07, energy: -0.05 },
  brawl: { annoyance: -0.3, energy: -0.05 },
  throw: { boredom: -0.25, happiness: 0.04, annoyance: -0.08 },
  bounce: { boredom: -0.25, happiness: 0.03 },
  smash: { boredom: -0.25, annoyance: -0.25 },
  pushwindow: { boredom: -0.3, happiness: 0.04, energy: -0.05 },
  kickwindow: { boredom: -0.3, annoyance: -0.2, happiness: 0.03 },
  surf: { boredom: -0.45, happiness: 0.08 },
  knock: { boredom: -0.15 },
  ledgesit: { energy: 0.05, boredom: 0.02, happiness: 0.03 },
  hang: { boredom: -0.35, happiness: 0.06 },
  sitdown: { energy: 0.08, boredom: 0.04, happiness: 0.03 },
  watchtv: { boredom: -0.5, happiness: 0.08, energy: 0.04 },
  videogame: { boredom: -0.6, happiness: 0.06 },
  duel: { boredom: -0.55, happiness: 0.05, energy: -0.08 },
  ride: { boredom: -0.45, happiness: 0.08, energy: -0.03 },
  ramp: { boredom: -0.3, happiness: 0.05 }, bridge: { boredom: -0.3, happiness: 0.05 }, drawramp: { boredom: -0.3, happiness: 0.05 },
};

/** Things you can tell him to do from the settings window. */
export const COMMANDS: { name: string; label: string }[] = [
  { name: 'wander', label: 'Wander' }, { name: 'explore', label: 'Explore' }, { name: 'sit', label: 'Sit' },
  { name: 'sleep', label: 'Nap' }, { name: 'wake', label: 'Wake up' }, { name: 'dance', label: 'Dance' },
  { name: 'hop', label: 'Hop' }, { name: 'chase', label: 'Chase cursor' }, { name: 'climb', label: 'Climb a window' },
  { name: 'getdown', label: 'Get down' }, { name: 'monkeybars', label: 'Monkey bars' },
  { name: 'doodle', label: 'Doodle' }, { name: 'grabcursor', label: 'Grab cursor (mischief)' }, { name: 'tantrum', label: 'Tantrum' }, { name: 'sulk', label: 'Sulk' },
  { name: 'wave', label: 'Wave' }, { name: 'laugh', label: 'Laugh' }, { name: 'shrug', label: 'Shrug' },
  { name: 'stomp', label: 'Stomp' }, { name: 'stretch', label: 'Stretch' }, { name: 'cower', label: 'Cower' },
  { name: 'backflip', label: 'Backflip' }, { name: 'frontflip', label: 'Front flip' }, { name: 'roll', label: 'Roll' }, { name: 'walljump', label: 'Wall jump' },
  { name: 'drawball', label: 'Draw a ball (and kick it)' }, { name: 'drawbox', label: 'Draw a box (and vault it)' }, { name: 'drawledge', label: 'Draw a ledge (and get on it)' },
  { name: 'drawsword', label: 'Draw a sword' }, { name: 'kick', label: 'Kick the ball' }, { name: 'getonit', label: 'Get on what he drew' },
  { name: 'swing', label: 'Swing his sword' }, { name: 'slash', label: 'Attack the cursor' },
  { name: 'spar', label: 'Spar with the cursor' }, { name: 'brawl', label: 'Fight the cursor (for real)' },
  { name: 'throw', label: 'Throw his ball at the cursor' }, { name: 'bounce', label: 'Bounce his ball' }, { name: 'smash', label: 'Smash with his mace' },
  { name: 'pushwindow', label: 'Push a window' }, { name: 'kickwindow', label: 'Kick a window' }, { name: 'surf', label: 'Surf on a window' },
  { name: 'knock', label: 'Knock on a window' }, { name: 'ledgesit', label: 'Sit on the edge' }, { name: 'hang', label: 'Hang off the cursor' },
  { name: 'ramp', label: 'Draw a ramp up to a window' }, { name: 'bridge', label: 'Draw a bridge to a window' }, { name: 'drawramp', label: 'Draw a ramp (and jump off it)' },
  { name: 'ropebridge', label: 'Draw a rope bridge' },
  { name: 'perch', label: 'Sit on something in your window' },
  { name: 'sitdown', label: 'Sit on a chair or couch' }, { name: 'watchtv', label: 'Watch TV' }, { name: 'videogame', label: 'Play video games' }, { name: 'ride', label: 'Ride the scooter' },
  { name: 'paint', label: 'Paint on his canvas' }, { name: 'playgame', label: 'Play Othello with you on the TV' }, { name: 'duel', label: 'Spar with his friend' },
  { name: 'highfive', label: 'High five his friend' }, { name: 'fistbump', label: 'Fist bump his friend' }, { name: 'handshake', label: 'Shake hands with his friend' },
  { name: 'pattycake', label: 'Patty cake with his friend' }, { name: 'hug', label: 'Hug his friend' }, { name: 'bump', label: 'Bump into his friend (rude)' },
  { name: 'chat', label: 'Go talk to his friend' }, { name: 'waveat', label: 'Wave at his friend' }, { name: 'sitwith', label: 'Sit with his friend' }, { name: 'naptogether', label: 'Nap next to his friend' }, { name: 'jointv', label: 'Join his friend at the TV' },
  {name:'closetab',label:'Close connected Chrome tab'}, {name:'closewindow',label:'Close front window'},
  {name:'pluck',label:'Take selected page element'}, {name:'restorepage',label:'Restore the Chrome page'}, {name:'folder',label:'Enter a real folder'}, {name:'file',label:'Enter a real file'},
  { name: 'drawtool', label: 'Draw a working tool' }, { name: 'drawgun', label: 'Draw a pistol' },
  { name: 'gun', label: 'Fire pistol at the cursor' },
  { name: 'shoot', label: 'Shoot arrows at the cursor' },
  { name: 'loseArm', label: 'Lose an arm' }, { name: 'loseLeg', label: 'Lose a leg' },
];

export class Mind {
  skill: Skill | null = null;
  /** When he last started a duel with his friend (so they don't fight nonstop), and did something with him. */
  private duelAt = -60;
  private socialAt = -20;
  private last = '';
  private queued: Skill | null = null;
  private pokes: number[] = [];
  private lookAt: { x: number; y: number } | null = null;
  private lookUntil = 0;
  private history: string[] = [];
  private onWindowSince = -1;   // world.time he got onto the window he's on (-1 = on the floor)
  private lastSupport = -1;
  private quipAt = 0;           // rate-limits little remarks
  private stuckAsked = 0;
  private restUntil = 0;
  private lastDoodle = -60;
  private lastGrab = -60;
  private watchStart = -1;
  private chill = false;
  private chillUntil = 0;
  private boredOfCursor = 0;        // short breather between activities
  private lastCursorSeen = 0;
  /** When you last took one of his things. */
  private takenAt = -100;
  /** When he last swatted your cursor off him, and last messed with a window. */
  private swatAt = -100;
  private hungAt = -100;
  /** Something to do right after the current skill (a new toy to try once it's landed). */
  private afterThat: (() => Option | undefined) | null = null;
  /** Building options for something you asked for directly (skip mood and politeness filters). */
  private forced = false;
  /** Why he can't do each thing you asked for (said instead of "?"). */
  private cant: Record<string, string> = {};
  private windowPrankAt = -100;
  private gameAskedAt = -300;
  /** Why he's doing what he's doing (shown in settings). */
  why = '';
  /** While the AI brain is deciding what he does next, instinct waits until this time. */
  holdUntil = 0;
  /** Your tweaks to how much he wants each thing (from the neurons in his head). 1 = normal. */
  biases: Record<string, number> = {};

  /** Recent skill names, newest last (for debugging and, later, the LLM). */
  get recent() { return this.history; }

  update(c: Ctx, dt: number) {
    c.mood.tick(dt);
    if (c.char.support !== this.lastSupport && c.char.mode === 'ground') {
      this.lastSupport = c.char.support;
      this.onWindowSince = c.char.support >= 0 ? c.world.time : -1;
    }
    c.char.posture = c.mood.posture();
    this.feelings(c, dt);

    if (this.skill) {
      this.skill.t += dt;
      if (this.skill.update(c, dt)) {
        const glow = AFTERGLOW[this.skill.name];
        if (glow) c.mood.nudge(glow);
        this.end(c);
        const next = this.afterThat?.();
        this.afterThat = null;
        if (next) { this.queued = next.make(); this.why = next.why; return; }
        // Catch his breath before the next thing (longer when tired) — keeps him from twitching between activities.
        this.restUntil = c.world.time + rand(1.5, 4) * (1.5 - c.mood.s.energy * 0.5);
      }
    } else if (this.queued && (c.char.ready || c.char.mode === 'sit')) {
      // (Take it off the queue first: starting it can queue what comes next, like his friend's instant "yes".)
      const next = this.queued;
      this.queued = null;
      this.begin(c, next);
    } else if (c.char.ready && c.world.time >= this.restUntil && c.world.time >= this.holdUntil) {
      const o = this.choose(c);
      this.why = o.why;
      this.begin(c, o.make());
    }
    this.updateLook(c);
  }

  /** Slow, sensible mood changes from what's going on around him. */
  private feelings(c: Ctx, dt: number) {
    const m = c.mood, w = c.world, ch = c.char;
    // How he walks says how he feels.
    if (w.time > this.chillUntil) { this.chill = chance(0.5); this.chillUntil = w.time + rand(90, 240); }
    const L = m.label, E = m.emotion;
    ch.gait = L === 'angry' ? 'stomp' : E === 'nervous' ? 'creep' : L === 'playful' || E === 'proud' ? 'skip' : L === 'sad' || L === 'sleepy' ? 'sulk'
      : L === 'bored' || ((E === 'content' || E === 'annoyed') && this.chill) ? 'pocket' : 'normal';
    // Body language standing still, from the finer emotion.
    ch.idleStyle = E === 'annoyed' ? 'crossed' : E === 'proud' ? 'hips' : E === 'happy' ? 'behind' : E === 'nervous' || E === 'lonely' ? 'hug' : 'none';
    ch.tapFoot = E === 'annoyed' || (E === 'bored' && this.chill);
    this.mutter(c);
    this.noticeWhatYoureDoing(c);
    // Moving around tires him out (running more), on top of the slow drain over time.
    if (ch.walking) m.s.energy -= dt / (ch.posture.speed > 1.2 ? 900 : 1800);
    // You coming back after a while: he's glad to see you.
    if (w.cursorMovedAt - this.lastCursorSeen > 120 && this.lastCursorSeen > 0 && !m.asleep) {
      m.nudge({ happiness: 0.08 * m.s.trust * 2, boredom: -0.25 });
      if (m.s.trust > 0.35 && ch.ready) {
        const line = c.memory.recall('greet') ?? pick(['oh hi!', 'hey!', "you're back"]);
        this.interrupt(c, new Sequence('greet', [{ face: 'cursor' }, { say: line }, { gesture: 'wave' }]));
        this.why = 'you came back';
      }
    }
    this.lastCursorSeen = w.cursorMovedAt;
    // You've had one of his things for a while: he stops lazing around and asks for it back.
    const taken = c.items.carried;
    const lazing = !this.skill || ['idle', 'wander', 'sit', 'explore', 'sigh', 'stretch'].includes(this.skill.name);
    if (taken && w.time - this.takenAt > 20 && lazing && !this.queued && ch.ready && ch.useHand && m.label !== 'sad' && m.label !== 'scared' && !m.asleep) {
      this.takenAt = w.time;
      this.interrupt(c, new AskBack(taken));
      this.why = `wants his ${taken.def.name.toLowerCase()} back`;
    }
    // Your cursor parked right on him: he swats it away (or boops it, or just glares at it).
    if (cur0(w) && w.time - w.cursorMovedAt > 2.2 && w.time > this.swatAt && lazing && !this.queued && !taken && (ch.ready || ch.mode === 'sit') && ch.useHand && !m.asleep) {
      const cur = w.cursor!, j = ch.body.j;
      const onHim = ch.hitTest(cur.x, cur.y, 12) !== null || Math.hypot(cur.x - j.head.x, cur.y - (j.head.y - ch.d.headR - 8 * ch.scale)) < 26 * ch.scale;
      if (onHim) {
        this.swatAt = w.time + rand(12, 25);
        const L2 = m.label;
        if (L2 !== 'sad' && L2 !== 'sleepy' && L2 !== 'scared') {
          const above = cur.y < j.head.y - ch.d.headR;
          this.interrupt(c, L2 === 'angry' ? new Sequence('swat', [{ face: 'cursor' }, { say: pick(['MOVE.', 'get off', 'ugh']) }, { gesture: 'punch', atCursor: true }])
            : L2 === 'playful' ? new Sequence('boop', [{ face: 'cursor' }, { gesture: above ? 'swat' : 'pokeBack', atCursor: true }, { say: pick(['boop', 'hehe', 'tag!']) }])
              : new Sequence('swat', [{ face: 'cursor' }, { wait: 0.4 }, { say: pick(['shoo', 'do you mind?', 'personal space']) }, { gesture: 'swat', atCursor: true }]));
          this.why = 'your cursor was sitting on him';
          if (ch.mode === 'sit') ch.standUp();
        }
      }
    }
    const away = w.time - w.cursorMovedAt;
    if (away > 300) { m.s.boredom += dt / 300; m.s.happiness -= dt / 1200; } // ignored for 5+ min: lonely
    else if (away < 3 && m.s.annoyance < 0.3 && w.cursor && Math.abs(w.cursor.x - ch.x) < 300) m.s.happiness += dt / 600; // company
  }

  private appTalkAt = 20;
  private longAt = -1;
  /** He notices what you're doing (the app in front) and says something about it, now and then. */
  private noticeWhatYoureDoing(c: Ctx) {
    const sc = c.world.screen, w = c.world, m = c.mood;
    if (!sc || m.asleep || !c.char.ready || w.time < this.appTalkAt) return;
    const mins = (w.time - sc.since) / 60;
    // Been at the same thing a long while.
    if (mins > 40 && (this.longAt < 0 || w.time - this.longAt > 30 * 60)) {
      this.longAt = w.time; this.appTalkAt = w.time + 120;
      c.say(pick([`you've been on ${sc.app} for ${Math.round(mins)} minutes`, `${Math.round(mins)} minutes of ${sc.app}...`, 'break time? stretch with me']), 2.4);
      if (chance(0.5)) c.char.doGesture('stretch');
    }
  }

  private mutterAt = 30;
  /** Now and then, a little line that says how he feels (when he isn't doing much). */
  private mutter(c: Ctx) {
    const w = c.world, m = c.mood, ch = c.char;
    if (w.time < this.mutterAt || m.asleep || !ch.ready || (this.skill && !['idle', 'wander', 'sit', 'ledgesit'].includes(this.skill.name))) return;
    this.mutterAt = w.time + rand(25, 60);
    const lines: Partial<Record<string, string[]>> = {
      annoyed: ['hmph.', 'ugh.', '*sigh*', 'whatever.'],
      happy: ['♪', '♪ la la ♪', 'hm hm hmm ♪'],
      excited: ['!!!', "let's GO", 'woo!'],
      lonely: ['hello?', 'anyone?', '...miss you', 'where did you go'],
      nervous: ['...', 'what was that', 'uh', 'hm?'],
      content: ['', '', 'nice.'],
    };
    const opts = lines[m.emotion];
    const line = opts ? pick(opts) : '';
    if (line) c.say(line, 1.6);
    if (m.emotion === 'lonely' && chance(0.5)) ch.doGesture('lookAround');
  }

  /** Is he free to start something new (not busy, not mid-air)? */
  get idle() { return !this.skill && !this.queued; }

  /**
   * Do something because you said so (from the settings window), or because his AI brain decided to.
   * Returns false if he can't do that right now (e.g. "get down" while on the floor).
   * `quiet`: don't say "?" when he can't.
   */
  command(c: Ctx, name: string, why = 'you told him to', quiet = false): boolean {
    const ch = c.char, m = c.mood;
    if (name === 'wake') { m.asleep = false; this.end(c); ch.standUp(); return true; }
    // Asked directly, he skips his own "not in the mood" and "you're busy in that window" filters.
    this.forced = true; this.cant = {};
    const s = this.makeSkill(c, name);
    this.forced = false;
    if (!s) {
      const reason = name === 'grabcursor' ? '(mischief mode is off)' : this.cant[name] || '?';
      if (!quiet) c.say(reason, reason.length > 2 ? 2.2 : 1);
      return false;
    }
    this.interrupt(c, s);
    m.asleep = false;
    this.why = why;
    if (ch.mode === 'lie' || ch.mode === 'sit') ch.standUp();
    return true;
  }

  /** Carry out a plan from his AI brain. */
  perform(c: Ctx, steps: PlanStep[], why: string) {
    const ch = c.char;
    if (!steps.length || !['ground', 'sit', 'lie', 'air', 'ragdoll', 'getup'].includes(ch.mode)) return false;
    c.mood.asleep = false;
    this.interrupt(c, new PlanSkill(this, steps));
    this.why = why;
    if (ch.mode === 'lie' || ch.mode === 'sit') ch.standUp();
    return true;
  }

  /** Build the skill for a command name (null if he can't do it right now). */
  makeSkill(c: Ctx, name: string): Skill | null {
    if(['closetab','closewindow','pluck','restorepage','folder','file'].includes(name))return new DesktopInteraction(name as import('../shared/desktop').DesktopAction);
    if(name==='drawgun')return c.items.find('draw') && c.char.useHand ? new DrawTool('gun',true) : null;
    if(name==='drawtool')return c.items.find('draw') && c.char.useHand ? new DrawTool('foam-sword',true) : null;
    if (name === 'wake') { c.mood.asleep = false; return new Sequence('wake', [{ wait: 0.1 }]); }
    if (name === 'grabcursor' && !c.canGrabCursor) return null;
    if (name === 'loseArm' || name === 'loseLeg') {
      // On purpose, for a gag (or because you told him to): pops one off with a little jump.
      const ch = c.char, l = name === 'loseArm' ? (ch.facing > 0 ? 'armL' : 'armR') : (ch.facing > 0 ? 'legL' : 'legR');
      if (!ch.destructible || !ch.hasLimb(l)) return null;
      return new Sequence(name, [{ say: pick(['watch this', 'hold on', 'heh']) }, { wait: 0.4 }, { pop: l }]);
    }
    const gestures: Gesture[] = ['wave', 'laugh', 'shrug', 'stomp', 'stretch', 'cower'];
    if ((gestures as string[]).includes(name)) return new Sequence(name, [{ gesture: name as Gesture, atCursor: true }]);
    return this.options(c).find((x) => x.name === name)?.make() ?? null;
  }

  /** What he's weighing right now and how much he wants each (for the neurons view in settings). */
  weigh(c: Ctx) {
    return this.options(c).map((o) => {
      const bias = this.biases[o.name] ?? 1;
      return { name: o.name, score: Math.round(o.score * bias * 100) / 100, bias, why: o.why };
    });
  }

  /** Forget the current plan (e.g. his body was rebuilt). */
  reset(c: Ctx) { this.end(c); this.queued = null; }

  private begin(c: Ctx, s: Skill) {
    c.look = 'default';
    this.skill = s;
    s.start(c);
    this.history.push(s.name);
    if (this.history.length > 20) this.history.shift();
  }

  private end(c: Ctx) {
    // (Let go of it before stopping it: stopping can tell his friend, whose answer can land back here.)
    const s = this.skill;
    if (!s) return;
    this.skill = null;
    s.stop(c);
    this.last = s.name;
    c.look = 'default';
  }

  /** Drop whatever he's doing (gestures too) and (optionally) do this next. */
  private interrupt(c: Ctx, next?: Skill) {
    this.end(c);
    c.char.cancelGesture();
    this.queued = next ?? null;
  }

  // ───────────── choosing what to do ─────────────

  private choose(c: Ctx): Option {
    // Annoyed isn't angry, but he's not in the mood for fun and games either.
    const grumpy = c.mood.emotion === 'annoyed', FUN = ['dance', 'chase', 'spar', 'hop', 'hang', 'bounce', 'backflip', 'frontflip', 'showoff', 'drawball', 'surf'];
    const excited = c.mood.emotion === 'excited';
    const opts = this.options(c).map((o) => ({ ...o, score: o.score * (this.biases[o.name] ?? 1) * (grumpy && FUN.includes(o.name) ? 0.25 : excited && FUN.includes(o.name) ? 1.4 : 1) }));
    // Square the scores so strong urges win more often; avoid repeating himself.
    let total = 0;
    const weights = opts.map((o) => {
      const wt = o.score > 0 ? o.score * o.score * (o.name === this.last ? 0.3 : 1) / (1+this.history.slice(-6).filter(name=>name===o.name).length*0.6) * rand(0.85, 1.15) : 0;
      total += wt;
      return wt;
    });
    let r = Math.random() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= weights[i];
      if (r <= 0) return opts[i];
    }
    return opts[0];
  }

  /** Everything he could do right now, how much he wants to, and why. */
  private options(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, w = c.world, ch = c.char;
    // Missing a limb: getting it back comes first.
    if (!ch.whole) return [
      { name: 'reattach', score: 5, why: 'wants his limb back', make: () => new Reattach() },
      { name: 'idle', score: 0.2, why: 'catching his breath', make: () => new Idle(rand(1, 2)) },
    ];
    const cur = w.cursor;
    const cursorActive = !!cur && w.time - w.cursorMovedAt < 6;
    const near = cursorActive && Math.abs(cur!.x - ch.x) < 250;
    const opts: Option[] = [
      { name: 'idle', score: 1.3, why: 'taking it easy', make: () => new Idle(rand(4, 10)) },
      { name: 'wander', score: 0.5 + s.boredom + s.energy * 0.3, why: s.boredom > 0.5 ? 'bored' : 'stretching his legs', make: () => new Wander() },
      { name: 'sit', score: 0.3 + (1 - s.energy) * 0.9, why: s.energy < 0.4 ? 'tired' : 'resting', make: () => new SitFor(rand(8, 20)) },
      { name: 'sleep', score: s.energy < 0.25 && s.annoyance < 0.5 && s.fear < 0.3 ? 2 + (0.25 - s.energy) * 8 : 0, why: 'worn out', make: () => new Sleep() },
      { name: 'chase', score: cursorActive && L === 'playful' ? 1.2 * s.trust + s.boredom : 0, why: 'wants to play with you', make: () => new ChaseCursor(rand(4, 8), false) },
      { name: 'brawl', score: cursorActive && L === 'angry' && ch.legCount === 2 && ch.useHand ? 1.5 : 0, why: 'mad at you: fists up', make: () => new Brawl(rand(5, 9), true) },
      { name: 'hang', score: cursorActive && c.cursorPlay && ch.legCount === 2 && ch.useHand && w.time - this.hungAt > 60 && cur!.y < ch.body.j.head.y - 20 && Math.abs(cur!.x - ch.x) < 300
          ? (L === 'playful' ? 0.45 : L === 'bored' ? 0.15 : 0) : 0,
        why: 'wants to hang off your cursor', make: () => { this.hungAt = w.time; return new HangCursor(); } },
      { name: 'spar', score: cursorActive && near && ch.legCount === 2 && ch.useHand ? (L === 'playful' ? 0.6 + s.trust * 0.4 : L === 'bored' ? 0.3 : 0.05) : 0,
        why: 'wants to spar with your cursor', make: () => new Brawl(rand(6, 10), false) },
      { name: 'avoid', score: near && (L === 'scared' || s.trust < 0.3) ? 2 : 0, why: s.fear > 0.3 ? 'scared of you' : "doesn't trust you", make: () => new AvoidCursor(4) },
      { name: 'dance', score: L === 'playful' ? 0.7 : 0, why: 'in a great mood', make: presets.dance },
      { name: 'hop', score: 0.05 + s.energy * 0.15 + (L === 'playful' ? 0.35 : 0), why: 'full of energy', make: () => presets.hop(s.energy) },
      { name: 'sulk', score: L === 'sad' ? 1.5 : 0, why: 'feeling down', make: () => new SitFor(rand(10, 22), true) },
      { name: 'tantrum', score: L === 'angry' ? 1 : 0, why: 'angry', make: presets.tantrum },
      { name: 'explore', score: L === 'bored' ? 1.2 : 0.15, why: 'curious', make: presets.explore },
      { name: 'stretch', score: 0.08 + (1 - s.energy) * 0.3, why: 'stiff', make: presets.stretch },
      { name: 'sigh', score: L === 'bored' ? 0.6 : 0, why: 'bored', make: presets.sigh },
      ...this.windowOptions(c),
      ...this.windowPranks(c),
      ...this.propOptions(c),
      ...this.friendOptions(c),
      ...this.perchOptions(c),
      ...this.itemOptions(c),
      ...this.parkourOptions(c),
      ...this.liveDrawingOptions(c),
      { name: 'showoff', score: c.savedMoves?.length && (L === 'playful' || L === 'bored') && s.energy > 0.4 ? 0.3 : 0,
        why: 'showing off a move he learned', make: () => { const m = pick(c.savedMoves!); return new PlanSkill(this, [{ say: `${m.name}!` }, { move: m.frames, name: m.name }]); } },
      { name: 'doodle', score: c.world.time - this.lastDoodle > 90 && L !== 'sad' && L !== 'sleepy' ? 0.08 + s.boredom * 0.35 + (L === 'playful' ? 0.15 : 0) : 0,
        why: 'feeling creative', make: () => { this.lastDoodle = c.world.time; return new DoodleSkill(); } },
      { name: 'grabcursor', score: c.canGrabCursor && cursorActive && near && c.world.time - this.lastGrab > 60 && (L === 'playful' || L === 'bored' || L === 'angry') ? 0.7 : 0,
        why: L === 'angry' ? 'getting back at you' : 'feeling mischievous', make: () => { this.lastGrab = c.world.time; return new GrabCursor(); } },
    ];
    return opts;
  }

  /** Drawing things that come to life (and then using them). */
  private liveDrawingOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world;
    const pen = c.items.find('draw');
    const canDraw = !!pen && pen.where !== 'cursor' && !!ch.useHand && L !== 'sleepy' && L !== 'sad';
    const fresh = w.time - this.lastDoodle > 60;
    const fun = L === 'playful' ? 0.25 : L === 'bored' ? 0.2 : 0.04;
    const swordTaken = c.items.list.some((it) => it.def.use === 'swing' && it.where === 'cursor') && !c.items.list.some((it) => it.def.use === 'swing' && it.where !== 'cursor');
    const opts: Option[] = [];
    if(canDraw && c.drawTools && fresh)opts.push({name:'drawtool',why:'making something useful with his pen',
      score:0.18+s.boredom*0.4,make:()=>{this.lastDoodle=w.time;const tool=c.items.list.find(it=>!it.def.drawn && ['swing','smash','gun'].includes(it.def.use) && ['belt','hand'].includes(it.where));return new DrawTool(tool?.def.id ?? 'foam-sword',true);}});
    const draw = (name: string, shape: keyof typeof LIVE_SHAPES, becomes: Becomes, then: PlanStep[], why: string, score: number) =>
      opts.push({ name, why, score: canDraw && fresh ? score : 0, make: () => { this.lastDoodle = w.time; return new PlanSkill(this, [{ draw: LIVE_SHAPES[shape], title: shape, becomes }, ...then]); } });
    draw('drawball', 'ball', 'ball', [{ do: 'kick' }], 'wants something to kick around', fun * 0.8 + s.boredom * 0.1);
    draw('drawbox', 'box', 'box', [{ do: 'getonit' }, { wait: 1.5 }, { do: 'getdown' }], 'drawing himself something to climb', fun * 0.6 + s.boredom * 0.08);
    draw('drawledge', 'platform', 'platform', [{ do: 'getonit' }, { wait: 2 }, { do: 'getdown' }], 'drawing himself a ledge', fun * 0.3);
    draw('ropebridge', 'bridge', 'bridge', [{ do: 'getonit' }, { wait: 2 }, { do: 'getdown' }], 'drawing a rope bridge to hang out on', fun * 0.15);
    // A ramp to walk up and jump off (the pen draws it as he goes).
    if (canDraw && fresh && rampPlan(c, null)) opts.push({ name: 'drawramp', why: 'drawing a ramp to jump off', score: fun * 0.45,
      make: () => { this.lastDoodle = w.time; return new PlanSkill(this, [{ do: 'rampnow' }, { wait: 0.6 }, { do: chance(0.5) ? 'frontflip' : 'getdown' }]); } });
    if (canDraw) opts.push({ name: 'rampnow', why: 'drawing a ramp', score: 0, make: () => new DrawRamp(null) });
    // You took his sword? He draws a new one.
    draw('drawsword', 'sword', 'item', [{ do: 'swing' }], 'you took his sword, so he drew one', swordTaken && (L === 'angry' || L === 'playful') ? 0.9 : 0);
    const ball = c.props?.nearestBall(ch.x, ch.body.j.hip.y);
    if (ball && ch.legCount === 2) opts.push({ name: 'kick', why: 'kicking his ball around', score: L === 'playful' ? 0.9 : L === 'bored' ? 0.7 : 0.25, make: () => new KickBall(ball) });
    const block = c.props?.blocks.length ? onDrawnBlock(c) : null;
    if (block) opts.push({ name: 'getonit', why: 'climbing on what he drew', score: 0.15, make: () => onDrawnBlock(c)! });
    return opts;
  }

  /** Showing off: flips, rolls, wall jumps. */
  private parkourOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char;
    if (!ch.whole) return [];
    const lively = (L === 'playful' ? 0.3 : L === 'bored' ? 0.15 : 0.02) * (s.energy > 0.45 ? 1 : 0);
    const wall = wallJumpTarget(c);
    return [
      { name: 'backflip', why: 'showing off', score: lively * 0.8, make: () => new Sequence('backflip', [{ flip: -1 }]) },
      { name: 'frontflip', why: 'showing off', score: lively * 0.6, make: () => new Sequence('frontflip', [{ flip: 1 }]) },
      { name: 'roll', why: 'tumbling around', score: lively * 0.3, make: () => new Sequence('roll', [{ roll: true }]) },
      ...(wall ? [{ name: 'walljump', why: 'doing parkour', score: lively * 0.9, make: () => new WallJump(wall) }] : []),
    ];
  }

  /** Using his things: swinging his sword, tidying up what's lying around, asking for what you took. */
  private itemOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world, opts: Option[] = [];
    const sword = c.items.find('swing'), cur = w.cursor;
    const near = !!cur && w.time - w.cursorMovedAt < 6 && Math.abs(cur.x - ch.x) < 220;
    if (sword && (sword.where === 'belt' || sword.where === 'hand') && ch.useHand) {
      opts.push({ name: 'swing', why: 'practicing his sword moves', score: L === 'playful' ? 0.35 : L === 'bored' ? 0.25 + s.boredom * 0.2 : 0.05, make: () => new SwordSwing(2, false) });
      opts.push({ name: 'slash', why: 'going after your cursor with his sword', score: L === 'angry' && near ? 1.3 : 0, make: () => new SwordSwing(2, true) });
    }
    const mace = c.items.find('smash');
    if (mace && (mace.where === 'belt' || mace.where === 'hand') && ch.useHand) {
      const onWin = ch.supportPlatform()?.win !== undefined && c.canMoveWindows;
      opts.push({ name: 'smash', why: near ? 'going after your cursor with his mace' : onWin ? 'bonking the window he\'s on' : 'practicing with his mace',
        score: L === 'angry' ? (near ? 1.1 : 0.3) : L === 'playful' ? (onWin ? 0.3 : 0.12) : L === 'bored' ? 0.2 : 0.03, make: () => new SwordSwing(near ? 2 : 3, near, 'smash') });
    }
    // His bow: target practice at your cursor (from a distance), or, mad at you, a volley.
    const bow = c.items.find('shoot');
    if (bow && (bow.where === 'belt' || bow.where === 'hand') && ch.useHand && ch.legCount === 2 && cur && w.time - w.cursorMovedAt < 8) {
      const d = Math.abs(cur.x - ch.x);
      opts.push({ name: 'shoot', why: L === 'angry' ? 'shooting arrows at you' : 'target practice at your cursor',
        score: d > 120 && d < 900 && cur.y < ch.body.j.hip.y ? (L === 'angry' ? 0.9 : L === 'playful' ? 0.35 : L === 'bored' ? 0.25 : 0.02) : 0,
        make: () => new ShootBow(L === 'angry' ? 3 : 2, () => w.cursor, 'cursor') });
    }
    const gun=c.items.find('gun');
    if(gun && ['belt','hand'].includes(gun.where) && ch.useHand && cur)opts.push({name:'gun',why:'aiming his pistol',
      score:L==='angry'?0.65:L==='playful'?0.3:0.05,make:()=>new ShootGun(()=>w.cursor,'cursor',3)});
    const ball = c.items.find('throw');
    if (ball && ball.where !== 'cursor' && ch.useHand && ch.legCount === 2) {
      const active = !!cur && w.time - w.cursorMovedAt < 8;
      opts.push({ name: 'throw', why: L === 'angry' ? 'throwing things at you' : 'playing catch with your cursor',
        score: !active ? 0 : L === 'angry' ? 0.8 : L === 'playful' ? 0.45 : L === 'bored' ? 0.25 : 0.04, make: () => new ThrowItem(true, L === 'angry' ? 2 : 1) });
      opts.push({ name: 'bounce', why: 'bouncing his ball', score: L === 'bored' ? 0.35 : L === 'playful' ? 0.25 : L === 'content' ? 0.08 : 0, make: () => new ThrowItem(false, Math.floor(rand(2, 5))) });
    }
    // His things lying around (you dropped them, or he did): pick them up and put them back on his belt.
    const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
    const lying = c.items.list.find((it) => it.where === 'world' && it.def.belt !== 'none' && it.at.y > feet - 60 * ch.scale && Math.abs(it.at.y - feet) < 120 * ch.scale);
    if (lying && ch.useHand) opts.push({ name: 'pickup', why: `his ${lying.def.name.toLowerCase()} is on the floor`, score: L === 'sleepy' ? 0.3 : 1.6, make: () => new FetchItem(lying) });
    // You've had one of his things for a while.
    const taken = c.items.carried;
    if (taken && w.time - this.takenAt > 15 && ch.useHand) {
      opts.push({ name: 'askback', why: `wants his ${taken.def.name.toLowerCase()} back`, score: L === 'sad' || L === 'scared' ? 0.3 : 2.2 + s.boredom * 0.5, make: () => { this.takenAt = w.time; return new AskBack(taken); } });
    }
    return opts;
  }

  /**
   * Messing with your windows: pushing, kicking, surfing on them, knocking on them, and sitting
   * on their edges. Not too often, and not the window you're busy in (unless he's mad).
   */
  private windowPranks(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world, opts: Option[] = [], forced = this.forced;
    if (ch.support >= 0 && ch.whole) {
      opts.push({ name: 'ledgesit', why: L === 'sad' ? 'sitting on the edge, feeling down' : 'sitting on the edge, legs dangling',
        score: 0.2 + (1 - s.energy) * 0.45 + s.boredom * 0.2 + (L === 'sad' ? 0.4 : 0), make: () => new LedgeSit(rand(8, 20)) });
    } else if (forced) this.cant.ledgesit = "I'm not up on anything";
    const pranks = ['knock', 'pushwindow', 'kickwindow', 'surf'];
    if (!ch.whole) { if (forced) for (const n of pranks) this.cant[n] = 'not without all my limbs'; return opts; }
    if (!forced && (L === 'sleepy' || L === 'sad' || L === 'scared' || s.energy < 0.3)) return opts;
    const fresh = forced || w.time - this.windowPrankAt > (L === 'angry' ? 25 : 50);
    const cur = w.cursor;
    // The window you're working in right now (cursor inside it, moving): leave it alone (unless you asked).
    const busy = (id?: number) => {
      if (forced) return false;
      const r = w.windows.find((x) => x.id === id);
      return !!r && !!cur && w.time - w.cursorMovedAt < 4 && cur.x >= r.x && cur.x <= r.x + r.w && cur.y >= r.y && cur.y <= r.y + r.h && L !== 'angry';
    };
    const sides = windowSidesAtHand(c).filter((x) => (forced || Math.abs(x.x - ch.x) < 600) && (x.win === undefined || c.canMoveWindow?.(x.win) !== false));
    const side = sides.find((x) => !busy(x.win));
    if (forced) {
      const why = c.windowMoves === 'off' ? '(moving windows is off in settings)' : c.windowMoves === 'stuck' ? "they won't budge. permission?"
        : c.windowMoves === 'unsupported' ? "can't move windows here" : '';
      const reach = !w.windows.length ? "I don't see any windows" : !side ? 'no window I can reach from here' : '';
      this.cant.knock = reach;
      this.cant.pushwindow = this.cant.kickwindow = reach || why;
      this.cant.surf = ch.supportPlatform()?.win === undefined ? 'I need to be standing on a window' : why;
    }
    const prank = (name: string, why: string, score: number, make: () => Skill) =>
      opts.push({ name, why, score: fresh ? score : 0, make: () => { this.windowPrankAt = w.time; return make(); } });
    if (side) {
      prank('knock', 'curious what\'s inside that window', L === 'bored' ? 0.3 : L === 'playful' ? 0.15 : 0.08, () => new KnockWindow(side));
      if (c.canMoveWindows) {
        prank('pushwindow', 'rearranging your windows', L === 'bored' ? 0.35 : L === 'playful' ? 0.25 : L === 'angry' ? 0.2 : 0.05, () => new PushWindow(side));
        prank('kickwindow', L === 'angry' ? 'taking it out on a window' : 'practicing kicks on a window', L === 'angry' ? 0.7 : L === 'playful' ? 0.2 : L === 'bored' ? 0.12 : 0.02, () => new KickWindow(side));
      }
    }
    const on = ch.supportPlatform();
    if (on?.win !== undefined && c.canMoveWindows && c.canMoveWindow?.(on.win) !== false && !busy(on.win)) {
      prank('surf', 'surfing on your window', L === 'playful' ? 0.55 : L === 'bored' ? 0.4 : 0.06, () => new WindowSurf());
    }
    return opts;
  }

  /** Things in your front window to stand and sit on (text, buttons, chat messages): he hops up onto one and sits on its edge. */
  private perchOptions(c: Ctx): Option[] {
    const ch = c.char, w = c.world, tops = w.uiTops ?? [], L = c.mood.label;
    if (!tops.length || !ch.whole || ch.legCount < 2) { if (this.forced) this.cant.perch = !w.screen ? "I can't see what's on your screen" : 'nothing in your window to sit on'; return []; }
    const reach = tops.map((t) => ({ t, r: routeTo(c, t) })).filter((o) => o.r && o.r.kind === 'jump');
    if (!reach.length) { if (this.forced) this.cant.perch = "can't reach anything in your window from here"; return []; }
    const o = reach[Math.floor(Math.random() * reach.length)];
    const chat = w.screen ? appKind(w.screen.app, w.screen.title) === 'chat' : false;
    return [{ name: 'perch', why: chat ? 'sitting on your messages' : 'hopping up onto something in your window',
      score: L === 'sleepy' || L === 'sad' ? 0.05 : (chat ? 0.45 : 0.15) + c.mood.s.boredom * 0.2,
      make: () => new Chain('perch', [() => new ClimbOnto(o.t, o.r!), (cc) => (cc.char.support === o.t.id ? new LedgeSit(rand(8, 20)) : null)]) }];
  }

  /** His furniture and toys: sit down, watch TV, ride the scooter. */
  private propOptions(c: Ctx): Option[] {
    const s = c.mood.s, E = c.mood.emotion, L = c.mood.label, ch = c.char, opts: Option[] = [];
    if (!ch.whole || ch.support >= 0 && !c.props?.thingOf(ch.support)) {
      // (Up on a window: he'd have to get down first. Keep it simple: props are for when he's on the floor.)
      if (this.forced) for (const n of ['sitdown', 'watchtv', 'videogame', 'ride', 'paint', 'playgame']) this.cant[n] = !ch.whole ? 'not like this' : 'I need to get down first';
      return opts;
    }
    const seat = propsOf(c, 'seat')[0], tv = propsOf(c, 'tv')[0], scooter = propsOf(c, 'ride')[0];
    const canvas = propsOf(c, 'canvas')[0];
    if (this.forced) {
      if (!seat) this.cant.sitdown = 'nothing to sit on (drop in a chair!)';
      if (!tv) this.cant.watchtv = this.cant.videogame = 'no TV (drop one in from my inventory)';
      if (!scooter) this.cant.ride = 'no scooter';
      if (!canvas) this.cant.paint = 'no canvas (drop one in from my inventory)';
      if (!tv) this.cant.playgame = 'no TV to play on (drop one in from my inventory)';
    }
    if (seat) opts.push({ name: 'sitdown', why: s.energy < 0.5 ? 'tired: having a sit on the ' + seat.def!.name.toLowerCase() : 'taking a seat',
      score: 0.15 + (1 - s.energy) * 0.7 + (L === 'sad' ? 0.3 : 0), make: () => new SitOnProp(seat) });
    if (tv) opts.push({ name: 'watchtv', why: 'watching TV', score: L === 'bored' ? 0.9 : E === 'lonely' || L === 'sad' ? 0.6 : L === 'sleepy' ? 0.3 : 0.25, make: () => new WatchTV(tv) });
    if (tv) opts.push({ name: 'videogame', why: 'playing video games', score: L === 'bored' ? 0.7 : L === 'playful' || E === 'excited' ? 0.5 : L === 'sleepy' || L === 'sad' ? 0.05 : 0.2, make: () => new PlayVideoGame(tv) });
    if (scooter && ch.legCount === 2 && ch.useHand) opts.push({ name: 'ride', why: 'scooter time', score: E === 'excited' ? 1 : L === 'playful' ? 0.7 : L === 'bored' ? 0.5 : 0.08, make: () => new RideScooter(scooter) });
    if (canvas && c.items.find('draw') && ch.useHand) opts.push({ name: 'paint', why: 'painting on his canvas', score: L === 'bored' ? 0.5 : L === 'playful' ? 0.3 : 0.05, make: () => new PaintCanvas(canvas) });
    if (tv && c.game) opts.push({ name: 'playgame', why: 'asking you to play a game', score: c.world.time - this.gameAskedAt >= 300 && (L === 'bored' || L === 'playful') ? 0.35 : 0,
      make: () => { this.gameAskedAt = c.world.time; return new PlayBoardGame(tv); } });
    return opts;
  }

  /** His friend: square up for a spar (a play fight, or a real one, depending on the setting). */
  private friendOptions(c: Ctx): Option[] {
    const foe = c.foe?.(), ch = c.char, L = c.mood.label, E = c.mood.emotion, s = c.mood.s;
    if (!foe) { if (this.forced) this.cant.duel = 'nobody to spar with (turn his friend on in Settings)'; return []; }
    // (Up on a window he can still call out to him; fighting, he has to be down on the floor.)
    if (ch.legCount < 2 || !ch.useHand || ch.support >= 0 && !c.props?.thingOf(ch.support)) { if (this.forced) this.cant.duel = 'not from up here'; return ch.mode === 'ground' ? this.socialOptions(c, foe).filter((o) => o.name === 'waveat') : []; }
    if (foe.busy && !this.forced) return this.socialOptions(c, foe).filter((o) => o.name === 'waveat' || o.name === 'sitwith' || o.name === 'jointv' || o.name === 'naptogether');
    const armed = c.fightMode === 'real' || chance(0.7);
    const bond = c.feel.bond;
    // (Best friends spar less in anger and more for fun; rivals fight more.)
    const score = c.world.time - this.duelAt < 90 ? 0 : (L === 'playful' || E === 'excited' ? 0.55 : L === 'bored' ? 0.4 : L === 'angry' ? 0.35 + Math.max(0, -bond) * 0.6 : L === 'sleepy' || L === 'sad' ? 0 : 0.1 + s.energy * 0.1);
    const opts: Option[] = [{ name: 'duel', why: c.fightMode === 'real' ? `a real duel with ${foe.name}` : `play fighting with ${foe.name}`, score,
      make: () => { this.duelAt = c.world.time; return new Duel(armed); } }];
    return [...opts, ...this.socialOptions(c, foe)];
  }

  /**
   * Doing things with his friend: a high five, a fist bump, a handshake, patty cake, a hug (he asks; the
   * other one decides), joining him at the TV, curling up next to him when he's asleep, or, in a mood,
   * shouldering him on purpose. How he feels about him (`c.feel.bond`) and his mood decide which.
   */
  private socialOptions(c: Ctx, f: FighterView): Option[] {
    const s = c.mood.s, L = c.mood.label, E = c.mood.emotion, ch = c.char, w = c.world, bond = c.feel.bond;
    const fh = f.joints.hip, hip = ch.body.j.hip;
    // Same floor (or the same window top), both on their feet, and he isn't busy with something of his own.
    const together = !!fh && Math.abs(fh.y - hip.y) < 40 * ch.scale && ch.legCount === 2 && !!ch.useHand;
    const free = together && f.mode === 'ground' && !f.busy && !f.asleep && f.doing !== 'together' && f.doing !== 'duel' && f.doing !== 'ask';
    const ready = this.forced || w.time - this.socialAt > 30;
    const happy = L === 'playful' || E === 'happy' || E === 'content' || E === 'excited';
    const opts: Option[] = [];
    const ask = (act: Act, score: number, why: string) => opts.push({ name: act, score: free && ready ? score : 0, why,
      make: () => { this.socialAt = w.time; return new AskTogether(act); } });
    if (this.forced && !free) this.cant[L] = `${f.name} is busy`;
    // (They're friends: something together comes up every minute or two, more when he's bored or in a good mood.)
    const sociable = L !== 'angry' && L !== 'scared' && L !== 'sleepy' && bond > -0.3;
    ask('chat', sociable ? 0.75 + s.boredom * 0.4 + bond * 0.3 : 0, `going over to talk to ${f.name}`);
    ask('highfive', (happy || L === 'bored') && bond > -0.1 ? 0.6 + bond * 0.3 : 0, `high five with ${f.name}`);
    ask('fistbump', sociable ? 0.45 + bond * 0.2 : 0, `fist bump with ${f.name}`);
    ask('handshake', L !== 'angry' && bond < 0.25 && bond > -0.5 ? 0.45 : happy ? 0.12 : 0, bond < 0.25 ? `making up with ${f.name}` : `shaking hands with ${f.name}`);
    ask('pattycake', (L === 'playful' || L === 'bored' && happy) && bond > 0 ? 0.65 + bond * 0.3 : L === 'playful' ? 0.3 : 0, `patty cake with ${f.name}`);
    ask('hug', bond > 0.45 && (happy || L === 'sad' || f.mood === 'sad') ? 0.3 + (f.mood === 'sad' ? 0.6 : 0) : 0, f.mood === 'sad' ? `${f.name} looks down` : `hugging ${f.name}`);
    // In a mood, and not that fond of him: shoulder him on purpose.
    const mood = L === 'angry' || E === 'annoyed';
    opts.push({ name: 'bump', score: free && ready && mood && bond < 0.4 ? 0.45 + s.annoyance * 0.5 - bond * 0.4 : 0, why: `taking it out on ${f.name}`,
      make: () => { this.socialAt = w.time; return new ShoulderBump(); } });
    // He's asleep and this one's sleepy too: curl up next to him.
    opts.push({ name: 'naptogether', score: f.asleep && together && (s.energy < 0.4 || this.forced) && bond > 0.1 ? 1.4 + bond : 0, why: `napping next to ${f.name}`,
      make: () => new NapTogether() });
    // Not on the same level (one up on a window), or he's sitting down: call out to him, and wave.
    const apart = !together || f.mode === 'sit';
    opts.push({ name: 'waveat', score: apart && !f.asleep && f.doing !== 'duel' && (ready || this.forced) && Math.abs(f.x - ch.x) < 800 && L !== 'angry' && bond > -0.4 ? 0.5 + s.boredom * 0.3 : 0,
      why: `calling out to ${f.name}`, make: () => { this.socialAt = w.time; return new WaveAt(); } });
    // He's sitting on the couch with room next to him: go sit with him.
    const seatOf = f.mode === 'sit' && together ? (c.props?.placed ?? []).find((t) => t.def!.use === 'seat' && t.sitters.size === 1 && t.seatRoom > 1 && !t.sitters.has(c.who) && Math.abs(t.center.x - f.x) < 80 * ch.scale) : undefined;
    opts.push({ name: 'sitwith', score: seatOf && bond > -0.2 && L !== 'angry' ? 0.65 + bond * 0.3 + (1 - s.energy) * 0.3 : 0, why: `sitting with ${f.name}`,
      make: () => { this.socialAt = w.time; return new SitOnProp(seatOf!, rand(15, 30)); } });
    // He's at the TV: join him (watch with him, or play against him).
    const tv = (f.doing === 'watchtv' || f.doing === 'videogame') ? propsOf(c, 'tv').find((t) => t.watchers.size > 0) : undefined;
    opts.push({ name: 'jointv', score: tv && bond > -0.2 && L !== 'angry' ? 0.45 + bond * 0.4 + s.boredom * 0.3 : 0, why: f.doing === 'videogame' ? `playing video games with ${f.name}` : `watching TV with ${f.name}`,
      make: () => (f.doing === 'videogame' ? new PlayVideoGame(tv!) : new WatchTV(tv!)) });
    return opts;
  }

  /** His friend asked to do something together: yes or no (mood, how he feels about him, whether he's busy). */
  private answerInvite(c: Ctx, act: string, name: string) {
    const L = c.mood.label, bond = c.feel.bond, ch = c.char;
    const busy = this.skill && ['duel', 'playgame', 'reattach', 'sleep', 'nap', 'together', 'ask', 'videogame', 'paint'].includes(this.skill.name);
    const able = ch.mode === 'ground' && ch.legCount === 2 && !!ch.useHand && !c.mood.asleep;
    let yes = !busy && able && isAct(act) && L !== 'angry' && L !== 'scared';
    if (yes) yes = chance(act === 'hug' ? (bond > 0.3 || L === 'sad' ? 0.9 : 0.3) : bond < -0.3 ? 0.25 : 0.65 + bond * 0.35);
    c.tell?.({ type: 'reply', act, yes });
    if (!yes) {
      if (able && !c.mood.asleep) c.say(L === 'angry' ? pick(['not now.', 'no.', 'leave me alone']) : busy ? pick(['busy!', 'later']) : pick(['nah', 'maybe later', 'eh']), 1.4);
      return;
    }
    this.why = `${name} wanted a ${act}`;
    if (chance(0.5)) c.say(pick(['yeah!', 'ok!', 'sure', act === 'hug' ? 'aww' : 'heh']), 1.2);
    this.socialAt = c.world.time;
    this.interrupt(c, new Together(act as Act, false));
  }

  /** Climbing onto windows and getting back down. */
  private windowOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, opts: Option[] = [];
    const lazy = L === 'sleepy' || L === 'sad';
    const up = reachableAbove(c);
    if (up.length) {
      const pickOne = up[Math.floor(Math.random() * up.length)];
      // Doesn't feel like climbing (a bit tired, or just because): he draws himself a way up instead.
      const tired = s.energy < 0.55;
      opts.push({ name: 'climb', why: s.boredom > 0.4 ? 'bored, looking for something to do' : 'wants a better view',
        score: lazy ? 0 : 0.3 + s.boredom * 0.9 + s.energy * 0.4 + (L === 'playful' ? 0.4 : 0),
        make: () => {
          const r = pickOne.drawn && (pickOne.route.kind === 'wall' || pickOne.route.kind === 'ceiling') && (tired || chance(0.35)) ? pickOne.drawn : pickOne.route;
          if (r !== pickOne.route) this.why = "doesn't feel like climbing: drawing his way up";
          return new ClimbOnto(pickOne.target, r);
        } });
      const drawable = up.filter((o) => o.drawn);
      if (this.forced && !drawable.some((o) => o.drawn!.kind === 'ramp')) this.cant.ramp = !c.items.find('draw') ? 'I need my pen for that' : 'nowhere to draw a ramp up to from here';
      if (this.forced && !drawable.some((o) => o.drawn!.kind === 'bridge')) this.cant.bridge = !c.items.find('draw') ? 'I need my pen for that' : 'no gap to bridge from here';
      if (drawable.length) {
        const o = drawable[Math.floor(Math.random() * drawable.length)];
        opts.push({ name: o.drawn!.kind === 'bridge' ? 'bridge' : 'ramp', why: o.drawn!.kind === 'bridge' ? 'drawing a bridge over to that window' : "wants up there, doesn't want to climb",
          score: L === 'sleepy' || L === 'sad' ? 0 : 0.1 + (tired ? 0.35 : 0) + s.boredom * 0.25, make: () => new ClimbOnto(o.target, o.drawn!) });
      }
    }
    // Monkey bars across the top of the screen.
    const edge = c.world.walls.filter((w) => w.top === 'ceiling').sort((a, b) => Math.abs(a.x - ch.x) - Math.abs(b.x - ch.x))[0];
    if (edge && ch.support < 0) {
      const far = c.world.walls.find((w) => w.top === 'ceiling' && w !== edge)!;
      const hangLen = ch.d.upperArm + ch.d.foreArm + ch.d.torso + ch.d.thigh + ch.d.shin;
      const landing = c.world.platforms.filter((p) => p.y - (c.world.bounds.top + hangLen) < c.lessons.safeDrop * ch.scale && p.x2 - p.x1 > 60);
      const dropOn = landing.length && chance(0.6) ? landing[Math.floor(Math.random() * landing.length)] : null;
      opts.push({ name: 'monkeybars', why: L === 'playful' ? 'feeling acrobatic' : 'bored',
        score: lazy || s.energy < 0.4 ? 0 : 0.12 + s.boredom * 0.5 + (L === 'playful' ? 0.35 : 0),
        make: () => dropOn ? new MonkeyBars(edge, (dropOn.x1 + dropOn.x2) / 2, false) : new MonkeyBars(edge, far.x - far.face * 30 * ch.scale, true) });
    }
    if (ch.support >= 0) {
      const onFor = c.world.time - this.onWindowSince;
      const want = 0.15 + Math.min(onFor / 60, 1) * 0.6 + (L === 'sleepy' ? 0.3 : 0);
      const safe = c.lessons.safeDrop * ch.scale;
      const hops = ([-1, 1] as const).map((side) => ({ side, drop: dropFrom(c, side) })).filter((o) => o.drop < safe);
      const climbs = ([-1, 1] as const).map((side) => ({ side, o: climbDownOption(c, side) })).filter((x) => x.o && x.o.drop < safe);
      if (hops.length) {
        const best = hops.reduce((a, b) => (a.drop < b.drop ? a : b));
        opts.push({ name: 'getdown', why: 'done up here', score: want, make: () => new GetDown(best.side) });
      } else if (climbs.length) {
        const best = climbs[0];
        opts.push({ name: 'getdown', why: 'done up here (too high to jump, climbing down)', score: want, make: () => new GetDown(best.side, best.o!.wall) });
      } else if (onFor > 45 && c.world.time - this.stuckAsked > 60) {
        // Too high both ways: he's stuck up here.
        opts.push({ name: 'stuck', why: 'too high to jump down', score: want, make: () => { this.stuckAsked = c.world.time; return new Sequence('stuck', [
          { gesture: 'lookAround' }, { face: 'cursor' }, { say: pick(['uh... help?', 'how do I get down', 'too high...']) }, { sit: rand(6, 12) },
        ]); } });
      }
    }
    return opts;
  }

  // ───────────── where he looks ─────────────

  private updateLook(c: Ctx) {
    const ch = c.char, w = c.world, cur = w.cursor;
    const head = ch.body.j.head;
    switch (c.look) {
      case 'none': ch.look = null; return;
      case 'down': ch.look = { x: ch.x + ch.facing * 40, y: head.y + 200 }; return;
      case 'cursor': ch.look = cur; return;
      case 'target': ch.look = c.lookTarget ?? null; return;
      case 'away':
        ch.look = cur ? { x: ch.x - sign(cur.x - ch.x) * 300, y: head.y } : null;
        return;
    }
    // Default: glance at the cursor when it moves close by, then lose interest for a while
    // (staring at it all the time looked creepy). Otherwise look around now and then.
    const near = cur && Math.hypot(cur.x - ch.x, cur.y - head.y) < 260 && w.time - w.cursorMovedAt < 1.5;
    if (near && w.time > this.boredOfCursor && c.mood.label !== 'sad') {
      if (this.watchStart < 0) this.watchStart = w.time;
      if (w.time - this.watchStart < 2.5) { ch.look = cur; return; }
      this.boredOfCursor = w.time + rand(5, 10); // seen it
    }
    this.watchStart = -1;
    if (w.time > this.lookUntil) {
      this.lookUntil = w.time + rand(2, 5);
      this.lookAt = chance(0.5) ? null : { x: ch.x + rand(-400, 400), y: head.y + rand(-150, 80) };
    }
    ch.look = this.lookAt;
  }

  // ───────────── reactions ─────────────

  onEvent(c: Ctx, e: MindEvent) {
    const m = c.mood, ch = c.char;
    switch (e.type) {
      case 'limbOff': {
        m.asleep = false;
        m.nudge({ fear: 0.15, happiness: -0.1, annoyance: e.yanked ? 0.25 : 0.08, trust: e.yanked ? -0.04 : 0, boredom: -0.4 });
        this.why = e.yanked ? 'you pulled his limb off' : 'a limb came off';
        if (!(this.skill instanceof Reattach)) this.interrupt(c, new Reattach());
        return;
      }
      case 'hitByFriend': {
        // Play fight: it's a game, he hits back. Real fight: it hurts, and it makes him mad (or scared).
        m.asleep = false;
        m.nudge(e.play ? { boredom: -0.2, happiness: 0.02 } : { annoyance: 0.1 + e.power * 0.1, fear: e.stabbed ? 0.2 : 0.05, happiness: -0.05, boredom: -0.3 });
        if (e.cut || e.stabbed || !c.char.whole) return; // losing a limb (or going down) comes first
        // (Not in the middle of your Othello match, though: he just complains.)
        if (this.skill?.name !== 'duel' && this.skill?.name !== 'playgame' && chance(e.play ? 0.75 : 0.9) && c.char.legCount === 2 && c.char.useHand) {
          this.why = e.play ? `${e.name} started it: fighting back` : `${e.name} attacked him`;
          this.interrupt(c, new Duel(e.play ? chance(0.6) : true));
        } else if (this.skill?.name !== 'duel' && chance(0.5)) c.say(pick(e.play ? ['hey!', 'oof', 'cheap shot'] : ['OW', 'hey!!', 'what was that for']), 1.2);
        return;
      }
      case 'invited': this.answerInvite(c, e.act, e.name); return;
      case 'replied': {
        if (!(this.skill instanceof AskTogether) || this.skill.act !== e.act) return;
        if (e.yes) { this.interrupt(c, new Together(this.skill.act, true)); return; }
        c.mood.nudge({ happiness: -0.04, annoyance: 0.03 });
        c.feel.bond = Math.max(-1, c.feel.bond - 0.02);
        this.interrupt(c);
        if (chance(0.6)) c.say(pick(['aw', 'fine.', 'rude', 'ok...']), 1.2);
        return;
      }
      case 'socialCancel':
        if (this.skill instanceof Together || this.skill instanceof AskTogether) this.interrupt(c);
        return;
      case 'bumped': {
        // Shouldered on purpose: he takes it personally. Sometimes that's a fight.
        m.nudge({ annoyance: 0.18, happiness: -0.05 });
        c.feel.bond = Math.max(-1, c.feel.bond - 0.1);
        this.why = `${e.name} bumped him`;
        const fight = (m.s.annoyance > 0.55 || m.label === 'angry' || c.feel.bond < 0) && chance(0.55) && ch.legCount === 2 && !!ch.useHand && this.skill?.name !== 'playgame';
        if (fight) { c.say(pick(['oh it\'s ON', 'you wanna go?', 'excuse ME?']), 1.4); this.duelAt = c.world.time; this.interrupt(c, new Duel(true)); }
        else if (ch.mode === 'ground' && !(this.skill instanceof Reattach)) {
          c.say(pick(['hey!', 'watch it', 'rude.', 'excuse you']), 1.4);
          if (this.skill?.name !== 'playgame' && this.skill?.name !== 'videogame' && this.skill?.name !== 'watchtv') this.interrupt(c, new Sequence('hey', [{ face: 'friend' }, { gesture: chance(0.5) ? 'shrug' : 'stomp' }]));
        }
        return;
      }
      case 'challenged': {
        // His friend wants to fight: he squares up too (same weapons), unless he's busy with something of his own.
        const keep = ['playgame', 'reattach', 'sleep', 'duel'];
        const upHigh = c.char.support >= 0 && !c.props?.thingOf(c.char.support); // (up on a window: he can't fight from there)
        if (this.skill && keep.includes(this.skill.name) || m.asleep || !c.char.whole || c.char.legCount < 2 || !c.char.useHand || upHigh) return;
        this.why = `${e.name} wants to fight`;
        this.interrupt(c, new Duel(e.armed));
        return;
      }
      case 'friendFighting': {
        // His friend's fighting your cursor: he joins in (unless he's busy with something of his own).
        const busy = this.skill && !['idle', 'wander', 'sit', 'explore', 'sigh', 'stretch', 'chase'].includes(this.skill.name);
        if (busy || m.asleep || !c.char.whole || c.char.legCount < 2 || !c.char.useHand) return;
        if (!c.world.cursor) return;
        this.why = 'backing up his friend';
        c.say(pick(['I got you!', 'two on one!', 'tag team!', 'me too!']), 1.2);
        this.interrupt(c, new Brawl(rand(5, 9), e.angry));
        return;
      }
      case 'limbOn':
        if (!(this.skill instanceof Reattach)) c.say(pick(['oh. thanks.', 'click.', 'better']), 1.2);
        return;
      case 'itemTaken': {
        m.nudge({ annoyance: 0.1, boredom: -0.2, trust: -0.01 });
        this.why = `you took his ${e.name}`;
        c.memory.count('itemsTaken');
        c.say(pick([`hey! my ${e.name}`, 'HEY', `that's my ${e.name}!`, 'rude.']), 1.6);
        this.takenAt = c.world.time;
        if (ch.mode === 'ground' && !(this.skill instanceof Reattach)) this.interrupt(c, new Sequence('hey', [{ face: 'cursor' }, { gesture: 'shrug' }]));
        return;
      }
      case 'itemDropped': {
        // You dropped his thing: he goes and gets it (unless he's in the middle of something that matters more).
        const it = c.items.list.find((x) => x.uid === e.uid);
        const busy = this.skill && !['idle', 'wander', 'sit', 'sulk', 'explore', 'sigh', 'askback', 'hey'].includes(this.skill.name);
        if (it && ch.useHand && !busy && ch.whole) {
          if (chance(0.5)) c.say(pick(['hey, careful', 'my ' + e.name + '!', 'I got it']), 1.2);
          this.interrupt(c, new FetchItem(it));
          this.why = `you dropped his ${e.name}`;
        }
        return;
      }
      case 'itemSpawned': {
        // Something new fell out of the sky: he looks up, and goes to get it (unless he's busy with something that matters).
        const it = c.items.list.find((x) => x.uid === e.uid);
        const busy = this.skill && !['idle', 'wander', 'sit', 'sulk', 'explore', 'sigh', 'stretch', 'ledgesit'].includes(this.skill.name);
        if (!it || m.asleep || busy || !ch.useHand) { if (!m.asleep) c.say('!', 0.8); return; }
        if (ch.mode === 'sit') ch.standUp();
        c.say(pick(['ooh!', "what's that?", '!', 'for me?']), 1.2);
        this.interrupt(c, new FetchItem(it));
        this.why = `a ${e.name} fell out of the sky`;
        return;
      }
      case 'propSpawned': {
        // Something new to play with!
        if (m.asleep) return;
        c.say(pick([`ooh! a ${e.name.toLowerCase()}`, `a ${e.name.toLowerCase()}!`, 'for me?']), 1.6);
        const busy = this.skill && !['idle', 'wander', 'sit', 'sulk', 'explore', 'sigh', 'stretch', 'ledgesit'].includes(this.skill.name);
        if (busy) return;
        const make = () => this.options(c).find((o) => o.name === (e.id === 'tv' ? 'watchtv' : e.id === 'scooter' ? 'ride' : 'sitdown'));
        // (Give it a moment to land first.)
        this.interrupt(c, new Sequence('look', [{ wait: 1.2 }, { gesture: 'lookAround' }]));
        this.afterThat = make;
        this.why = `you dropped in a ${e.name.toLowerCase()}`;
        return;
      }
      case 'appChanged': {
        // You switched apps: sometimes he has something to say about the new one.
        const w = c.world;
        if (m.asleep || w.time < this.appTalkAt || !chance(0.45)) return;
        const lines = APP_LINES[appKind(e.app, e.title)];
        if (!lines) return;
        this.appTalkAt = w.time + rand(90, 200);
        c.say(pick(lines), 2);
        return;
      }
      case 'itemGiven':
        m.nudge({ happiness: 0.08, trust: 0.02, annoyance: -0.1 });
        c.say(pick(['thanks!', 'oh, thanks', 'mine again', ':)']), 1.3);
        return;
      case 'poked': return this.onPoke(c);

      case 'smacked': {
        // Much worse than a poke: it hurts, and it was on purpose.
        m.nudge({ annoyance: 0.28, fear: 0.08, trust: -0.03, happiness: -0.06, boredom: -0.4 });
        this.why = 'you smacked him';
        const wasAsleep = m.asleep;
        m.asleep = false;
        const remembers = !wasAsleep && chance(0.4) ? c.memory.recall('smacked') : null;
        c.say(remembers ?? (wasAsleep ? pick(['WHA-', '!?!']) : e.speed > 3000 ? pick(['OW!', 'HEY!!', 'OWW']) : pick(['ow!', 'hey!', '!!'])), 1.3);
        if (wasAsleep) ch.standUp();
        const L = m.label;
        this.interrupt(c, L === 'scared' || L === 'sad'
          ? new Sequence('flinch', [{ gesture: 'cower' }, { walkTo: 'away', run: L === 'scared' }])
          : L === 'angry'
            ? new Sequence('retaliate', [{ face: 'cursor' }, { say: pick(['YOU.', 'oh it is ON', 'stop that!']) }, { gesture: 'pokeBack', atCursor: true }, { gesture: 'stomp' }])
            : new Sequence('glare', [{ face: 'cursor' }, { wait: 0.6 }, { say: pick(['rude.', 'why', '>:(']) }]));
        return;
      }

      case 'petted':
        m.nudge({ happiness: 0.08, trust: 0.015, annoyance: -0.15, boredom: -0.2 });
        if (m.asleep) return;
        if (m.s.annoyance > 0.5) { c.say('hmph', 1.2); return; }
        // Lean into it, unless he's in the middle of something important.
        if ((ch.mode === 'ground' || ch.mode === 'sit') && !(this.skill instanceof Sequence && this.skill.name === 'enjoy')) {
          if (ch.mode === 'sit') ch.standUp();
          this.interrupt(c, new Sequence('enjoy', [{ gesture: 'nuzzle', atCursor: true }]));
          this.why = 'you\'re petting him';
        }
        if (chance(0.4)) c.say((chance(0.3) ? c.memory.recall('petted') : null) ?? pick([':)', '♪', 'hehe', 'mmm']), 1.2);
        return;

      case 'hangOn': return;
      case 'grabbed': {
        this.interrupt(c);
        m.asleep = false;
        m.nudge({ boredom: -0.3, fear: 0.08 * (1 - m.s.trust) });
        const L = m.label;
        if (L === 'angry') { c.say(pick(['put me down!', 'HEY', 'let go!'])); ch.doGesture('flail'); }
        else if (L === 'scared') { c.say(pick(['AAA', 'no no no', '!!'])); ch.doGesture('flail'); }
        else if (chance(0.5) && c.memory.recall('grabbed')) c.say(c.memory.recall('grabbed')!, 1.6);
        else if (L === 'playful') c.say(pick(['wheee', 'hi!', 'up!']));
        else if (L === 'sad' || L === 'sleepy') c.say('...');
        else c.say(pick(['?', '!', 'oh']), 1.2);
        return;
      }

      case 'released':
        if (e.speed > 900) {
          const fun = m.label === 'playful' && m.s.trust > 0.6;
          m.nudge(fun ? { happiness: 0.05, fear: 0.1 } : { fear: 0.25, annoyance: 0.12, trust: -0.02 });
          c.say(fun ? 'WHEEE' : pick(['AAAA', 'WAAA', 'aaah!']), 1.4);
        }
        return;

      case 'crashed':
        // Knocked down in a fight: part of the fight. He gets up and keeps going (the duel handles it).
        if (this.skill?.name === 'duel' && ch.whole) { if (chance(0.5)) c.say(pick(['oof', 'ow!', 'lucky', 'ugh']), 1); return; }
        if (this.skill instanceof GetDown) {
          // Lesson learned: that jump was too big. Be warier of drops this high.
          const was = c.lessons.safeDrop;
          c.lessons.safeDrop = Math.max(120, Math.min(was, (this.skill.drop / ch.scale) * 0.8));
          m.nudge({ happiness: -0.05, fear: 0.1 });
          c.say(pick(['ow... too high', 'never again', 'OW. noted.']), 2);
          this.interrupt(c, this.afterFall(c));
          return;
        }
        m.nudge({ happiness: -0.08, fear: 0.12, annoyance: 0.08, trust: -0.01 });
        c.say(e.speed > 1600 ? 'OW' : pick(['ow.', 'oof', 'ouch']), 1.4);
        this.interrupt(c, this.afterFall(c));
        this.why = 'recovering from a fall';
        return;

      case 'tripped':
        if (this.skill?.name === 'duel' && ch.whole) { if (chance(0.35)) c.say(pick(['oof', 'whoa', '!']), 0.8); return; }
        m.nudge({ happiness: -0.03, annoyance: 0.05 });
        c.say('!', 0.8);
        this.interrupt(c, this.afterFall(c));
        return;

      case 'fellOff':
        if (!(this.skill instanceof GetDown) && c.world.time > this.quipAt) {
          this.quipAt = c.world.time + 3;
          c.say(pick(['whoa!', 'woah', '!!']), 1);
        }
        return;

      case 'carried':
        if (e.speed > 12 * ch.scale && c.world.time > this.quipAt && chance(0.3)) {
          this.quipAt = c.world.time + 6;
          c.say(pick(['whoa', 'wheee', 'hey, steady!']), 1.2);
        }
        return;

      case 'bonked':
        if (m.label === 'playful') { c.say(pick(['hey!', 'haha', 'ow, nice shot']), 1.2); m.nudge({ boredom: -0.2 }); }
        else { c.say(pick(['OW', 'who threw that', 'ow!']), 1.2); m.nudge({ annoyance: 0.08, boredom: -0.2 }); }
        return;
      case 'rolled':
        if (chance(0.3)) c.say(pick(['parkour!', 'nailed it', 'tuck and roll']), 1.2);
        return;
      case 'flipped':
        m.feel('proud', 5);
        if (chance(0.5)) c.say(pick(['ta-da!', 'stuck it', '10/10']), 1.2);
        return;
      case 'vaulted':
        m.feel('proud', 3);
        if (chance(0.3)) c.say(pick(['hup!', 'parkour', 'easy']), 1);
        return;
      case 'landed':
        if (this.skill instanceof GetDown && e.speed > 600) {
          // Landed a big drop fine: a little braver next time.
          c.lessons.safeDrop = Math.min(600, Math.max(c.lessons.safeDrop, (this.skill.drop / ch.scale) * 1.05));
        }
        if (e.speed > 500 && m.label === 'playful') c.say(pick(['!', 'ta-da', 'again!']), 1.2);
        return;

      case 'hitWall':
        if (chance(0.3)) c.say(pick(['oof', 'wall.']), 1);
        return;

      case 'hitCursor': {
        m.nudge({ annoyance: -0.06, happiness: 0.03, boredom: -0.1 });
        if (e.power > 0.8) m.feel('proud', 4);
        if (this.skill instanceof Brawl) this.skill.landed();
        if (c.world.time > this.quipAt && chance(e.power > 0.6 ? 0.6 : 0.3)) {
          this.quipAt = c.world.time + 2.5;
          c.say(e.power > 0.8 ? pick(['HOME RUN', 'BOOM', 'POW!', 'and STAY out']) : pick(['ha!', 'pow', 'bap', 'hyah']), 1);
        }
        return;
      }
      case 'cursorFreed':
        if (c.world.time > this.quipAt && chance(0.35)) { this.quipAt = c.world.time + 3; c.say(pick(['aw', 'hey, I was playing with that', 'fine']), 1.2); }
        return;
      case 'parried':
        m.nudge({ annoyance: -0.04, happiness: 0.05, boredom: -0.2 });
        this.why = 'blocked your smack';
        c.say(pick(['BLOCKED', 'nice try', 'parry!', 'too slow']), 1.2);
        return;
      case 'windowStuck':
        this.why = "that window won't move for him; giving it a break";
        c.say(pick(["huh. it won't move", 'stuck?', '...heavy']), 1.6);
        return;
    }
  }

  private onPoke(c: Ctx) {
    const m = c.mood, ch = c.char, now = c.world.time;
    this.pokes = this.pokes.filter((t) => now - t < 6);
    const recent = this.pokes.length;
    this.pokes.push(now);
    m.nudge({ annoyance: 0.1 + 0.07 * recent, boredom: -0.3, trust: -0.004 });
    this.why = recent > 1 ? 'you keep poking him' : `you poked him (he was ${m.label})`;

    if (m.asleep) {
      if (chance(0.35 + 0.2 * recent)) {
        this.interrupt(c, new Sequence('woken', [
          { wait: 1.3 }, { face: 'cursor' }, { say: pick(['!?', 'hey...', 'what.', "I was sleeping"]) }, { gesture: 'shrug' },
        ]));
        m.asleep = false;
        m.nudge({ annoyance: 0.15 });
        ch.standUp();
      } else c.say('z', 1);
      return;
    }

    const free = ch.mode === 'ground' || ch.mode === 'sit';
    const L = m.label;
    if (!free) { c.say(L === 'angry' ? '!!' : '!', 0.8); return; }

    let react: Sequence | Skill | null = null;
    const remembers = chance(0.15) ? c.memory.recall('poked') : null;
    if (remembers) { c.say(remembers, 1.6); return; }
    switch (L) {
      case 'sad':
        // He just doesn't have it in him.
        if (chance(0.75)) c.say('...', 1.5);
        else c.say(pick(['leave me alone', 'not now']), 2);
        return;
      case 'sleepy':
        c.say(pick(['mm', '...', 'tired']), 1.2);
        return;
      case 'angry':
        react = chance(0.6)
          ? new Sequence('retaliate', [{ face: 'cursor' }, { say: pick(['HEY!', 'stop it!', 'quit it', '!!']) }, { gesture: chance(0.5) ? 'stomp' : 'pokeBack', atCursor: true }])
          : new ChaseCursor(3.5, true);
        break;
      case 'scared':
        react = new Sequence('flinch', [{ gesture: 'cower' }, { say: '!' }, { walkTo: 'away', run: true }]);
        break;
      case 'playful':
        m.nudge({ happiness: 0.04, annoyance: -0.05 });
        react = pick([
          () => new Sequence('giggle', [{ say: pick(['hehe', 'haha', 'hey!']) }, { gesture: 'laugh' }]),
          () => new Sequence('tag', [{ face: 'cursor' }, { gesture: 'pokeBack', atCursor: true }, { say: 'tag!' }]),
          () => new Sequence('boing', [{ say: '!' }, { jump: 450 }]),
          () => new ChaseCursor(4, false),
        ])();
        break;
      default: { // content / bored (and annoyed: grumbles, doesn't fight yet)
        const annoyed = m.s.annoyance > 0.35;
        if (m.emotion === 'annoyed') {
          react = pick([
            () => new Sequence('grumble', [{ face: 'cursor' }, { say: pick(['hmph.', 'quit it.', 'do you MIND', 'stop.']) }]),
            () => new Sequence('grumble', [{ face: 'cursor' }, { gesture: 'stomp' }, { say: 'ugh.' }]),
            () => new Sequence('swat', [{ face: 'cursor' }, { gesture: 'swat', atCursor: true }, { say: 'shoo.' }]),
          ])();
          break;
        }
        react = pick([
          () => new Sequence('huh', [{ face: 'cursor' }, { say: annoyed ? 'hey.' : '?' }]),
          () => new Sequence('poke-back', [{ face: 'cursor' }, { gesture: 'pokeBack', atCursor: true }, { say: annoyed ? 'stop.' : 'hi' }]),
          () => new Sequence('shrug', [{ face: 'cursor' }, { gesture: 'shrug' }]),
          ...(m.label === 'bored' ? [() => new ChaseCursor(4, false)] : []),
        ])();
      }
    }
    if (ch.mode === 'sit' && L !== 'angry' && chance(0.6)) { c.say('?', 1); return; } // can't be bothered to get up
    if (ch.mode === 'sit') ch.standUp();
    this.interrupt(c, react ?? undefined);
  }

  /** What he does once he's back on his feet after falling. */
  private afterFall(c: Ctx): Skill | undefined {
    switch (c.mood.label) {
      case 'angry': return new Sequence('glare', [{ face: 'cursor' }, { say: pick(['>:(', 'really?', 'rude.']) }, { gesture: 'stomp' }]);
      case 'scared': return new AvoidCursor(3);
      case 'playful': return new Sequence('again', [{ say: 'again!' }, { jump: 420 }]);
      case 'sad': return new Sequence('mope', [{ say: '...' }, { sit: rand(4, 8) }]);
      default:
        // In front of you, too: a bit embarrassing.
        if (chance(0.5)) { c.mood.feel('embarrassed', 5); return new Sequence('oops', [{ gesture: 'scratch' }, { say: pick(['...you didn\'t see that', 'meant to do that', 'heh. oops']) }]); }
        return chance(0.5) ? new Sequence('shake-off', [{ gesture: 'shrug' }, { say: pick(['...okay', 'fine', 'whoa']) }]) : undefined;
    }
  }
}
