import { conversationLine } from '../personality';
import { Skill, arrive, type Ctx } from './context';
import type { PeerMsg, FighterView } from '../peer';
import { propActions } from '../capabilities';
import { Tool, FetchItem, GetDown } from '../skills';
import { Pong } from '../pong';
import type { Item } from '../items';
import type { Vec } from '../math';
import type { Thing } from '../props';

export const GROUP_ACTS = [
  'wave',
  'chat',
  'couch',
  'watch',
  'duet',
  'triangle',
  'mirror',
  'relay',
  'carry',
  'pong',
  'catch',
] as const;
export type GroupAct = (typeof GROUP_ACTS)[number];
export interface GroupPlan {
  session: string;
  act: GroupAct;
  leader: string;
  members: string[];
  x: number;
  gap: number;
  prop?: number;
  destination?: number;
  ballUid?: number;
  turns?: { speaker: string; listener: string; text: string; seconds: number }[];
}
export interface GroupView {
  session: string;
  act: GroupAct;
  members: string[];
  phase: 'meet' | 'ready' | 'do';
  ball?: { uid: number; at: Vec; holder: string | null; throws: number; catches: number };
}
const required: Partial<Record<GroupAct, number>> = {
  duet: 2,
  triangle: 3,
  mirror: 4,
  relay: 5,
  carry: 2,
  pong: 2,
  catch: 2,
};
export const availableForGroup = (v: FighterView) =>
  !!v.id &&
  !v.busy &&
  !v.asleep &&
  (v.energy ?? 1) >= 0.15 &&
  v.whole &&
  v.hp > 0.25 &&
  ['ground', 'sit'].includes(v.mode) &&
  !v.group &&
  !['duel', 'together', 'ask'].includes(v.doing ?? '');

export function groupPlan(
  c: Ctx,
  act: GroupAct,
  prop?: Thing,
  destination?: number,
): GroupPlan | null {
  if (!GROUP_ACTS.includes(act)) return null;
  const talent = act === 'carry' ? 'building' : act === 'pong' ? 'games' : null;
  const affinity = (id: string) => {
    const r = c.relationship?.(id);
    return (
      (r?.bond ?? 0.4) +
      (r?.cooperation ?? 0.5) * 0.2 +
      (act === 'pong' && (r?.bond ?? 0.4) >= 0 ? (r?.rivalry ?? 0) * 0.25 : 0)
    );
  };
  const peers = (c.peers?.() ?? [])
    .filter(availableForGroup)
    .sort(
      (a, b) =>
        Number(b.talent === talent) - Number(a.talent === talent) ||
        affinity(b.id!) - affinity(a.id!) ||
        Math.abs(a.x - c.char.x) - Math.abs(b.x - c.char.x),
    );
  const n = required[act] ?? Math.min(5, peers.length + 1);
  if (peers.length < n - 1 || n < 2 || !['ground', 'sit'].includes(c.char.mode) || !c.char.whole) {
    c.say('Not enough friends free right now.', 1.5);
    return null;
  }
  if (!prop && (act === 'couch' || act === 'watch' || act === 'pong'))
    prop = c.props?.placed.find(
      (t) =>
        !t.held &&
        !t.movingBy &&
        Math.abs(t.tilt) < 0.35 &&
        (act === 'couch'
          ? t.seatRoom >= n && !t.sitters.size
          : !!t.def && propActions(t.def).includes('watch')),
    );
  if ((act === 'couch' || act === 'watch' || act === 'pong' || act === 'carry') && !prop) {
    c.say('We need a free spot.', 1.5);
    return null;
  }
  const ball =
    act === 'catch'
      ? c.items.list.find((i) => i.def.id === 'bouncy-ball' && i.where !== 'cursor')
      : null;
  if (act === 'catch' && !ball) {
    c.say('I need my ball.', 1.5);
    return null;
  }
  const gap = (act === 'catch' ? 160 : 34) * c.char.scale,
    half = ((n - 1) * gap) / 2;
  const x = Math.max(
    c.world.bounds.left + half + 25,
    Math.min(c.world.bounds.right - half - 25, prop?.center.x ?? c.char.x),
  );
  const members = [c.who, ...peers.slice(0, n - 1).map((v) => v.id!)];
  const turns: NonNullable<GroupPlan['turns']> = [];
  if (act === 'chat' || act === 'couch') {
    let speaker = 0,
      listener = 1;
    for (let turn = 0; turn < 14; turn++) {
      const id = members[speaker],
        to = members[listener],
        person = peers.find((v) => v.id === id);
      const personality = id === c.who ? c.personality : person?.personality;
      const recent =
        turn === 0
          ? (c.relationship?.(to)?.recent.at(-1) ?? c.relationship?.(to)?.lastShared)
          : undefined;
      const history =
        recent === 'pong' || recent === 'duel'
          ? 'Another friendly rematch sometime?'
          : recent === 'compare'
            ? 'Shall we compare our drawings again?'
            : recent === 'check'
              ? 'Thanks for checking on me earlier.'
              : null;
      const text =
        turn === 0
          ? (history ?? conversationLine(personality, 0, false))
          : conversationLine(personality, Math.floor(turn / 3), turn % 3 !== 0);
      turns.push({
        speaker: id,
        listener: to,
        text,
        seconds:
          3.1 + Math.min(1.8, text.length / 35) + 0.35 + (personality === 'gentle' ? 0.3 : 0),
      });
      speaker = listener;
      listener =
        turn % 3 === 0 ? (speaker === 0 ? 1 : 0) : (speaker + 1 + Math.floor(turn / 3)) % n;
      if (listener === speaker) listener = (speaker + 1) % n;
    }
  }
  return {
    session: `${c.who}:${c.world.time}:${act}`,
    act,
    leader: c.who,
    members,
    turns,
    x,
    gap,
    prop: prop?.n,
    destination,
    ballUid: ball?.uid,
  };
}
export function validGroupPlan(plan: GroupPlan, sender: string, self: string) {
  return (
    typeof plan?.session === 'string' &&
    plan.session.length < 120 &&
    GROUP_ACTS.includes(plan.act) &&
    plan.leader === sender &&
    Array.isArray(plan.members) &&
    plan.members.length >= 2 &&
    plan.members.length <= 5 &&
    new Set(plan.members).size === plan.members.length &&
    plan.members[0] === sender &&
    plan.members.includes(self) &&
    Number.isFinite(plan.x) &&
    Number.isFinite(plan.gap) &&
    (plan.act !== 'catch' || (Number.isInteger(plan.ballUid) && plan.ballUid! > 0)) &&
    (!plan.turns ||
      (Array.isArray(plan.turns) &&
        plan.turns.length <= 16 &&
        plan.turns.every(
          (t) =>
            t &&
            plan.members.includes(t.speaker) &&
            plan.members.includes(t.listener) &&
            t.speaker !== t.listener &&
            typeof t.text === 'string' &&
            t.text.length <= 120 &&
            Number.isFinite(t.seconds) &&
            t.seconds >= 2 &&
            t.seconds <= 8,
        ))) &&
    plan.gap >= 10 &&
    plan.gap <= (plan.act === 'catch' ? 640 : 160) &&
    (!required[plan.act] || plan.members.length === required[plan.act])
  );
}

/** Each member owns their movement. Coordination uses only snapshots and bounded JSON messages. */
export class GroupActivity extends Skill {
  readonly name = 'group';
  phase: GroupView['phase'] = 'meet';
  private epoch = Infinity;
  private cancelled = false;
  private beat = -1;
  private target: Thing | null = null;
  private started = false;
  private finished = false;
  private descent: GetDown | null = null;
  private ball: Item | null = null;
  private fetchBall: FetchItem | null = null;
  private ballTool = new Tool('throw');
  private holder = 0;
  private flight = false;
  private ballTime = 0;
  private throws = 0;
  private catches = 0;
  constructor(readonly plan: GroupPlan) {
    super();
  }
  get view(): GroupView {
    return {
      session: this.plan.session,
      act: this.plan.act,
      members: [...this.plan.members],
      phase: this.phase,
      ...(this.ball
        ? {
            ball: {
              uid: this.ball.uid,
              at: { x: this.ball.at.x, y: this.ball.at.y },
              holder: this.flight ? null : this.plan.members[this.holder],
              throws: this.throws,
              catches: this.catches,
            },
          }
        : {}),
    };
  }
  private broadcast(c: Ctx, m: PeerMsg) {
    for (const id of this.plan.members) if (id !== c.who) c.tellTo?.(id, m);
  }
  start(c: Ctx) {
    c.look = 'target';
    if (this.plan.act === 'catch' && this.plan.leader === c.who) {
      this.ball =
        c.items.list.find(
          (it) =>
            it.uid === this.plan.ballUid && it.def.id === 'bouncy-ball' && it.where !== 'cursor',
        ) ?? null;
      this.ballTool.item = this.ball;
      if (this.ball?.where === 'world') {
        this.fetchBall = new FetchItem(this.ball, false);
        this.fetchBall.start(c);
      }
    }
    this.target = c.props?.things.find((t) => t.n === this.plan.prop) ?? null;
    if (this.plan.leader === c.who) {
      this.broadcast(c, { type: 'groupInvite', plan: this.plan });
      c.say(this.plan.act === 'carry' ? 'Give me a hand?' : 'Come join us!', 1.4);
    }
    for (const it of c.items.list) if (it.where === 'hand') c.items.stow(it);
  }
  receive(c: Ctx, m: PeerMsg, sender: string) {
    if (!this.plan.members.includes(sender)) return;
    if (m.type === 'groupCancel' && m.session === this.plan.session) {
      if (
        !m.finished &&
        this.started &&
        ['chat', 'couch'].includes(this.plan.act) &&
        this.plan.members.length > 2
      ) {
        this.plan.members = this.plan.members.filter((id) => id !== sender);
        this.plan.leader = this.plan.members[0];
        this.plan.turns = this.plan.turns
          ?.filter((t) => t.speaker !== sender)
          .map((t) => ({
            ...t,
            listener:
              t.listener === sender
                ? this.plan.members.find((id) => id !== t.speaker)!
                : t.listener,
          }));
      } else {
        this.cancelled = !m.finished;
        this.finished = !!m.finished;
      }
    }
    // A companion may have joined much later and have a different simulation clock.
    // Start the short shared delay on receipt instead of copying the leader's local timestamp.
    if (
      m.type === 'groupGo' &&
      m.session === this.plan.session &&
      sender === this.plan.leader &&
      Number.isFinite(m.epoch)
    ) {
      this.epoch = c.world.time + 0.1;
      this.phase = 'do';
    }
  }
  update(c: Ctx, dt: number) {
    const p = this.plan,
      ch = c.char,
      i = p.members.indexOf(c.who),
      target = this.target;
    const peers = p.members
      .filter((id) => id !== c.who)
      .map((id) => c.peers?.().find((v) => v.id === id));
    if (
      this.cancelled ||
      !ch.whole ||
      ch.hp < 0.25 ||
      c.mood.asleep ||
      peers.some((v) => !v || !v.whole || v.asleep || v.hp < 0.25)
    )
      return true;
    if (this.t > 2 && peers.some((v) => v!.group?.session !== p.session)) return true;
    if (
      p.prop !== undefined &&
      (!target || !c.props?.things.includes(target) || target.held || Math.abs(target.tilt) > 0.6)
    )
      return true;
    // A ground-mode figure can still be perched on a window. Gather on the floor
    // using the existing descent skill before asking it to walk to the meeting point.
    if (
      this.phase === 'meet' &&
      !this.descent &&
      ch.ready &&
      Math.max(ch.body.j.footL.y, ch.body.j.footR.y) < c.world.bounds.floor - 65 * ch.scale
    ) {
      this.descent = new GetDown(p.x < ch.x ? -1 : 1);
      this.descent.start(c);
    }
    if (this.descent) {
      this.descent.t += dt;
      const down = this.descent.update(c);
      if (!down || !ch.ready) return this.t > 40;
      this.descent.stop(c);
      this.descent = null;
    }
    if (ch.mode !== 'ground' && !(p.act === 'couch' && ch.mode === 'sit')) return true;
    let x = p.x + (i - (p.members.length - 1) / 2) * p.gap;
    if (p.act === 'couch') {
      if (!target!.claimSeat(c.who, ch.x)) return true;
      const seat = target!.seatFor(c.who)!;
      x = seat.x;
      if (ch.mode === 'sit') ch.scootTo(seat);
    }
    if (p.act === 'watch' || p.act === 'pong')
      x = target!.center.x + target!.facing * (80 * ch.scale + i * p.gap);
    if (p.act === 'carry')
      x =
        target!.center.x +
        (i === 0 ? -1 : 1) *
          (target!.def!.bounds![2] - target!.def!.bounds![0]) *
          target!.scale *
          0.6;
    if (p.act === 'catch' && p.leader === c.who && this.phase !== 'do') {
      if (!this.ball || !c.items.list.includes(this.ball) || this.ball.where === 'cursor')
        return true;
      if (this.fetchBall) {
        this.fetchBall.t += dt;
        if (!this.fetchBall.update(c, dt)) return this.t > 40;
        this.fetchBall.stop(c);
        this.fetchBall = null;
        if (this.ball.where === 'world') return true;
      }
      const got = this.ballTool.fetch(c, dt);
      if (got !== 'ready') return got === 'none' || this.t > 40;
    }
    if (this.phase !== 'do') {
      if (this.t > 40) return true;
      if (this.phase === 'meet' && !arrive(c, x, 8)) return false;
      ch.stop();
      this.phase = 'ready';
      if (p.act === 'couch' && ch.mode !== 'sit') ch.sitOn(target!.seatFor(c.who)!, 1, 'front');
      if (
        p.leader === c.who &&
        peers.every((v) => v!.group?.session === p.session && v!.group.phase === 'ready')
      ) {
        this.epoch = c.world.time + 0.1;
        this.phase = 'do';
        this.broadcast(c, {
          type: 'groupGo',
          session: p.session,
          epoch: this.epoch,
        });
      }
      return false;
    }
    const u = c.world.time - this.epoch;
    if (u < 0) return false;
    if (this.finished || peers.some((v) => v!.group?.session !== p.session)) return true;
    const neck = ch.body.j.neck,
      sc = ch.scale;
    if (!this.started) {
      this.started = true;
      c.mood.nudge({ happiness: 0.04, boredom: -0.1 });
    }
    c.lookTarget = target?.center ?? { x: p.x, y: neck.y };
    if (p.act === 'catch') return this.playCatch(c, dt, u, peers as FighterView[]);
    if (p.act === 'carry') {
      if (target!.sitters.size || target!.watchers.size || target!.players.length) return true;
      if (p.leader === c.who) {
        if (target!.movingBy && target!.movingBy !== c.who) return true;
        target!.movingBy = c.who;
        const dx = p.destination! - target!.center.x;
        if (!Number.isFinite(dx)) return true;
        if (Math.abs(dx) < 3) {
          target!.facing = p.destination! < p.x ? 1 : -1;
          this.finished = true;
          return true;
        }
        const next = target!.center.x + Math.sign(dx) * Math.min(Math.abs(dx), dt * 35 * sc);
        const width = (target!.def!.bounds![2] - target!.def!.bounds![0]) * target!.scale;
        if (
          c.props!.things.some(
            (t) =>
              t !== target &&
              t.collisionHull.some(
                (q) => Math.abs(q.x - next) < width / 2 + 4 && q.y > c.world.bounds.floor - 60 * sc,
              ),
          )
        ) {
          c.say('Something’s in the way.', 1.5);
          return true;
        }
        target!.place({ x: next, y: target!.center.y }, 0);
      }
      ch.walkTo(x, false);
      ch.handTarget = target!.toWorld(i === 0 ? 0 : target!.def!.bounds![2], 5);
      ch.posture.hunch = 0.7;
      return u > 25;
    }
    if (p.act === 'pong') {
      if (!target!.pong) {
        if (p.leader !== c.who) return false;
        if (c.consoleRequired && !target!.consoleConnected) {
          c.say('Plug in a console first.', 1.5);
          return true;
        }
        target!.pong = new Pong(
          [p.members[0], p.members[1]],
          [c.talent === 'games' ? 0.9 : 0.65, peers[0]?.talent === 'games' ? 0.9 : 0.65],
        );
        target!.players = [...p.members];
        target!.on = true;
        c.say('First to five!', 1.5);
      }
      target!.watchers.add(c.who);
      ch.facing = Math.sign(target!.center.x - ch.x) || 1;
      ch.handsAt = {
        R: { x: ch.x + 8 * sc, y: neck.y + 22 * sc },
        L: { x: ch.x - 8 * sc, y: neck.y + 22 * sc },
      };
      if (target!.pong.winner !== null) {
        if (this.beat !== -2) {
          this.beat = -2;
          c.say(target!.pong.winner === i ? 'Won that round!' : 'Rematch?', 1.5);
          c.mood.nudge({ happiness: target!.pong.winner === i ? 0.08 : 0.01 });
        }
        this.finished = u > 20 && target!.pong.time + 2 < u;
        return this.finished;
      }
      return u > 180;
    }
    if (p.act === 'watch') {
      target!.watchers.add(c.who);
      target!.on = true;
      ch.facing = Math.sign(target!.center.x - ch.x) || 1;
    }
    const beat = Math.floor(u / 0.8),
      wave = Math.sin((u * Math.PI) / 0.8);
    if (p.act === 'wave' || p.act === 'relay') {
      const active = p.act === 'wave' || beat % p.members.length === i;
      ch.handsAt = active ? { R: { x: neck.x + 13 * sc, y: neck.y - (18 + 8 * wave) * sc } } : null;
    } else if (p.act === 'triangle')
      ch.handsAt = {
        R: { x: p.x + (i - 1) * 4 * sc, y: neck.y + (8 + i * 3) * sc },
      };
    else if (p.act === 'mirror' || p.act === 'duet') {
      const other = peers.find((v) => v!.id === p.members[i % 2 === 0 ? i + 1 : i - 1]);
      if (other) {
        ch.facing = Math.sign(other.x - ch.x) || 1;
        ch.handsAt = {
          R: { x: (ch.x + other.x) / 2, y: neck.y + (8 + wave * 12) * sc },
          L: { x: ch.x - ch.facing * 8 * sc, y: neck.y + (12 - wave * 8) * sc },
        };
      }
    }
    if (p.act === 'chat' || p.act === 'couch') {
      let turn = 0,
        elapsed = u;
      const turns = p.turns;
      if (turns?.length)
        while (turn < turns.length - 1 && elapsed >= turns[turn].seconds) {
          elapsed -= turns[turn].seconds;
          turn++;
        }
      else {
        turn = Math.floor(u / 3.8);
        elapsed = u % 3.8;
      }
      const current = turns?.[turn],
        person = current?.speaker ?? p.members[turn % p.members.length],
        speaker = p.members.indexOf(person);
      const addressed = current?.listener;
      const lookAt = person === c.who ? addressed : person;
      const view = lookAt === c.who ? null : peers.find((v) => v!.id === lookAt);
      c.lookTarget = view?.joints.head ?? { x: p.x, y: neck.y };
      if (speaker === i && turn !== this.beat) {
        this.beat = turn;
        const topic = Math.floor(turn / p.members.length);
        c.say(
          current?.text ?? conversationLine(c.personality, topic, speaker !== 0),
          (current?.seconds ?? 3.8) - 0.4,
        );
        c.mood.nudge({ socialNeed: -0.08, contentment: 0.02 });
      }
      // Speakers gesture briefly; listeners look toward them and settle during pauses.
      const acknowledge = person !== c.who && addressed === c.who && elapsed > 0.5 && elapsed < 0.9;
      ch.handsAt =
        speaker === i && elapsed < 1.3
          ? { R: { x: neck.x + ch.facing * 12 * sc, y: neck.y + 16 * sc } }
          : acknowledge
            ? { L: { x: neck.x - ch.facing * 7 * sc, y: neck.y + 22 * sc } }
            : null;
      ch.posture.hunch += speaker === i ? 0 : Math.sin(u * 2) * 0.035;
    } else if (beat !== this.beat) {
      this.beat = beat;
      if (p.act === 'triangle' && beat % 3 === 0 && i === 0) c.burst?.(p.x, neck.y + 12 * sc, 6);
    }
    this.finished = u > (['chat', 'couch', 'watch'].includes(p.act) ? 45 : 9);
    return this.finished;
  }
  /** Only the owner advances the original ball. Other figures read its immutable peer snapshot. */
  private playCatch(c: Ctx, dt: number, u: number, peers: FighterView[]) {
    const ch = c.char,
      p = this.plan,
      other = peers[0],
      neck = ch.body.j.neck,
      sc = ch.scale;
    ch.stop();
    ch.facing = Math.sign(other.x - ch.x) || 1;
    const anchor = (id: string) => {
      const j = id === c.who ? neck : (peers.find((v) => v.id === id)!.joints.neck ?? neck);
      const f = id === c.who ? ch.facing : Math.sign(ch.x - other.x) || 1;
      return { x: j.x + f * 16 * sc, y: j.y + 22 * sc };
    };
    let snapshot = peers.find((v) => v.id === p.leader)?.group?.ball;
    if (p.leader === c.who) {
      const ball = this.ball;
      if (!ball || !c.items.list.includes(ball) || ball.where === 'cursor') return true;
      if (ball.where === 'hand') c.items.drop(ball, 0, 0);
      if (ball.where !== 'world') return true;
      ball.working = true;
      ball.thrownAt = -10;
      this.ballTime += dt;
      const to = anchor(p.members[this.flight ? 1 - this.holder : this.holder]);
      if (!this.flight) {
        ball.at = { ...to, z: 0 };
        ball.dir = { x: 1, y: 0, z: 0 };
        ball.loosen();
        if (this.ballTime > 1.1) {
          const dest = anchor(p.members[1 - this.holder]),
            n = 66,
            drag = 0.995,
            step = 1 / 120;
          // Match the actual Verlet drag and gravity for a .55 s arc; collision still decides success.
          const sum = (drag * (1 - drag ** n)) / (1 - drag),
            gravity = 2000 * step * step;
          const fall = (gravity / (1 - drag)) * (n - sum);
          ball.loosen((dest.x - to.x) / (step * sum), (dest.y - to.y - fall) / (step * sum));
          this.flight = true;
          this.ballTime = 0;
          this.throws++;
        }
      } else if (this.ballTime > 0.4 && Math.hypot(ball.at.x - to.x, ball.at.y - to.y) < 24 * sc) {
        this.holder = 1 - this.holder;
        this.flight = false;
        this.ballTime = 0;
        this.catches++;
        if (this.catches === 1)
          c.say(c.personality === 'competitive' ? 'Nice catch. Keep it going!' : 'Got it!', 1.5);
      } else if (this.ballTime > 1.3) {
        c.say("Oops. Let's get that later.", 1.5);
        return true;
      }
      snapshot = this.view.ball;
      if (this.catches >= 8 || u > 30) {
        this.finished = this.catches > 0;
        return true;
      }
    }
    if (!snapshot) return u > 3;
    c.lookTarget = snapshot.at;
    const to = anchor(c.who),
      has = snapshot.holder === c.who,
      near = Math.hypot(snapshot.at.x - to.x, snapshot.at.y - to.y) < 65 * sc;
    ch.handsAt =
      has || near ? { R: { x: to.x + 4 * sc, y: to.y }, L: { x: to.x - 4 * sc, y: to.y } } : null;
    return u > 35;
  }
  stop(c: Ctx) {
    this.fetchBall?.stop(c);
    if (this.ball&&c.items.list.includes(this.ball)) {
      this.ball.working = false;
      this.ball.thrownAt = -10;
      if (this.ball.where === 'hand' && !c.items.stow(this.ball)) c.items.drop(this.ball, 0, 0);
    }
    this.descent?.stop(c);
    for (const id of this.plan.members)
      if (id !== c.who)
        c.recordActivity?.(id, this.plan.act, this.started && this.finished && !this.cancelled);
    this.broadcast(c, {
      type: 'groupCancel',
      session: this.plan.session,
      finished: this.finished && !this.cancelled,
    });
    c.char.handsAt = null;
    c.char.handTarget = null;
    c.char.stop();
    if (this.target) {
      if (this.plan.act === 'pong') {
        this.target.pong = null;
        this.target.players = [];
      }
      this.target.leaveSeat(c.who);
      this.target.watchers.delete(c.who);
      if (!this.target.watchers.size) this.target.on = false;
      if (this.target.movingBy === c.who) this.target.movingBy = null;
    }
    if (c.char.mode === 'sit' && this.plan.act === 'couch') c.char.standUp();
  }
}
