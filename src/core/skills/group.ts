import { Skill, arrive, type Ctx } from "./context";
import type { PeerMsg, FighterView } from "../peer";
import { propActions } from "../capabilities";
import { Pong } from "../pong";
import type { Thing } from "../props";

export const GROUP_ACTS = [
  "wave",
  "chat",
  "couch",
  "watch",
  "duet",
  "triangle",
  "mirror",
  "relay",
  "carry",
  "pong",
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
}
export interface GroupView {
  session: string;
  act: GroupAct;
  members: string[];
  phase: "meet" | "ready" | "do";
}
const required: Partial<Record<GroupAct, number>> = {
  duet: 2,
  triangle: 3,
  mirror: 4,
  relay: 5,
  carry: 2,
  pong: 2,
};
export const availableForGroup = (v: FighterView) =>
  !!v.id &&
  !v.busy &&
  !v.asleep &&
  v.whole &&
  v.hp > 0.25 &&
  v.mode === "ground" &&
  !v.group &&
  !["duel", "together", "ask"].includes(v.doing ?? "");

export function groupPlan(
  c: Ctx,
  act: GroupAct,
  prop?: Thing,
  destination?: number,
): GroupPlan | null {
  if (!GROUP_ACTS.includes(act)) return null;
  const talent = act === "carry" ? "building" : act === "pong" ? "games" : null;
  const peers = (c.peers?.() ?? [])
    .filter(availableForGroup)
    .sort(
      (a, b) =>
        Number(b.talent === talent) - Number(a.talent === talent) ||
        Math.abs(a.x - c.char.x) - Math.abs(b.x - c.char.x),
    );
  const n = required[act] ?? Math.min(5, peers.length + 1);
  if (
    peers.length < n - 1 ||
    n < 2 ||
    c.char.mode !== "ground" ||
    !c.char.whole
  ) {
    c.say("Not enough friends free right now.", 1.5);
    return null;
  }
  if (!prop && (act === "couch" || act === "watch" || act === "pong"))
    prop = c.props?.placed.find(
      (t) =>
        !t.held &&
        !t.movingBy &&
        Math.abs(t.tilt) < 0.35 &&
        (act === "couch"
          ? t.seatRoom >= n && !t.sitters.size
          : !!t.def && propActions(t.def).includes("watch")),
    );
  if (
    (act === "couch" || act === "watch" || act === "pong" || act === "carry") &&
    !prop
  ) {
    c.say("We need a free spot.", 1.5);
    return null;
  }
  const gap = 34 * c.char.scale,
    half = ((n - 1) * gap) / 2;
  const x = Math.max(
    c.world.bounds.left + half + 25,
    Math.min(c.world.bounds.right - half - 25, prop?.center.x ?? c.char.x),
  );
  return {
    session: `${c.who}:${c.world.time}:${act}`,
    act,
    leader: c.who,
    members: [c.who, ...peers.slice(0, n - 1).map((v) => v.id!)],
    x,
    gap,
    prop: prop?.n,
    destination,
  };
}
export function validGroupPlan(plan: GroupPlan, sender: string, self: string) {
  return (
    typeof plan?.session === "string" &&
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
    plan.gap >= 10 &&
    plan.gap <= 160 &&
    (!required[plan.act] || plan.members.length === required[plan.act])
  );
}

/** Each member owns their movement. Coordination uses only snapshots and bounded JSON messages. */
export class GroupActivity extends Skill {
  readonly name = "group";
  phase: GroupView["phase"] = "meet";
  private epoch = Infinity;
  private cancelled = false;
  private beat = -1;
  private target: Thing | null = null;
  private started = false;
  constructor(readonly plan: GroupPlan) {
    super();
  }
  get view(): GroupView {
    return {
      session: this.plan.session,
      act: this.plan.act,
      members: [...this.plan.members],
      phase: this.phase,
    };
  }
  private broadcast(c: Ctx, m: PeerMsg) {
    for (const id of this.plan.members) if (id !== c.who) c.tellTo?.(id, m);
  }
  start(c: Ctx) {
    c.look = "target";
    this.target = c.props?.things.find((t) => t.n === this.plan.prop) ?? null;
    if (this.plan.leader === c.who) {
      this.broadcast(c, { type: "groupInvite", plan: this.plan });
      c.say(
        this.plan.act === "carry" ? "Give me a hand?" : "Come join us!",
        1.4,
      );
    }
    for (const it of c.items.list) if (it.where === "hand") c.items.stow(it);
  }
  receive(c: Ctx, m: PeerMsg, sender: string) {
    if (!this.plan.members.includes(sender)) return;
    if (m.type === "groupCancel" && m.session === this.plan.session)
      this.cancelled = true;
    // A companion may have joined much later and have a different simulation clock.
    // Start the short shared delay on receipt instead of copying the leader's local timestamp.
    if (
      m.type === "groupGo" &&
      m.session === this.plan.session &&
      sender === this.plan.leader &&
      Number.isFinite(m.epoch)
    ) {
      this.epoch = c.world.time + 0.1;
      this.phase = "do";
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
    if (this.t > 2 && peers.some((v) => v!.group?.session !== p.session))
      return true;
    if (
      p.prop !== undefined &&
      (!target ||
        !c.props?.things.includes(target) ||
        target.held ||
        Math.abs(target.tilt) > 0.6)
    )
      return true;
    if (ch.mode !== "ground" && !(p.act === "couch" && ch.mode === "sit"))
      return true;
    let x = p.x + (i - (p.members.length - 1) / 2) * p.gap;
    if (p.act === "couch") {
      if (!target!.claimSeat(c.who, ch.x)) return true;
      const seat = target!.seatFor(c.who)!;
      x = seat.x;
      if (ch.mode === "sit")
        ch.seat = {
          ...seat,
          x: ch.seat!.x + (seat.x - ch.seat!.x) * Math.min(1, dt * 8),
        };
    }
    if (p.act === "watch" || p.act === "pong")
      x = target!.center.x + target!.facing * (80 * ch.scale + i * p.gap);
    if (p.act === "carry")
      x =
        target!.center.x +
        (i === 0 ? -1 : 1) *
          (target!.def!.bounds![2] - target!.def!.bounds![0]) *
          target!.scale *
          0.6;
    if (this.phase !== "do") {
      if (this.t > 15) return true;
      if (this.phase === "meet" && !arrive(c, x, 8)) return false;
      ch.stop();
      this.phase = "ready";
      if (p.act === "couch" && ch.mode !== "sit")
        ch.sitOn(target!.seatFor(c.who)!, 1, "front");
      if (
        p.leader === c.who &&
        peers.every(
          (v) => v!.group?.session === p.session && v!.group.phase === "ready",
        )
      ) {
        this.epoch = c.world.time + 0.1;
        this.phase = "do";
        this.broadcast(c, {
          type: "groupGo",
          session: p.session,
          epoch: this.epoch,
        });
      }
      return false;
    }
    const u = c.world.time - this.epoch;
    if (u < 0) return false;
    if (peers.some((v) => v!.group?.session !== p.session)) return true;
    const neck = ch.body.j.neck,
      sc = ch.scale;
    if (!this.started) {
      this.started = true;
      c.mood.nudge({ happiness: 0.04, boredom: -0.1 });
    }
    c.lookTarget = target?.center ?? { x: p.x, y: neck.y };
    if (p.act === "carry") {
      if (
        target!.sitters.size ||
        target!.watchers.size ||
        target!.players.length
      )
        return true;
      if (p.leader === c.who) {
        if (target!.movingBy && target!.movingBy !== c.who) return true;
        target!.movingBy = c.who;
        const dx = p.destination! - target!.center.x;
        if (!Number.isFinite(dx) || Math.abs(dx) < 3) {
          target!.facing = p.destination! < p.x ? 1 : -1;
          return true;
        }
        const next =
          target!.center.x +
          Math.sign(dx) * Math.min(Math.abs(dx), dt * 35 * sc);
        const width =
          (target!.def!.bounds![2] - target!.def!.bounds![0]) * target!.scale;
        if (
          c.props!.things.some(
            (t) =>
              t !== target &&
              t.collisionHull.some(
                (q) =>
                  Math.abs(q.x - next) < width / 2 + 4 &&
                  q.y > c.world.bounds.floor - 60 * sc,
              ),
          )
        ) {
          c.say("Something’s in the way.", 1.5);
          return true;
        }
        target!.place({ x: next, y: target!.center.y }, 0);
      }
      ch.walkTo(x, false);
      ch.handTarget = target!.toWorld(i === 0 ? 0 : target!.def!.bounds![2], 5);
      ch.posture.hunch = 0.7;
      return u > 25;
    }
    if (p.act === "pong") {
      if (!target!.pong) {
        if (p.leader !== c.who) return false;
        if (c.consoleRequired && !target!.consoleConnected) {
          c.say("Plug in a console first.", 1.5);
          return true;
        }
        target!.pong = new Pong(
          [p.members[0], p.members[1]],
          [
            c.talent === "games" ? 0.9 : 0.65,
            peers[0]?.talent === "games" ? 0.9 : 0.65,
          ],
        );
        target!.players = [...p.members];
        target!.on = true;
        c.say("First to five!", 1.5);
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
          c.say(
            target!.pong.winner === i ? "Won that round!" : "Rematch?",
            1.5,
          );
          c.mood.nudge({ happiness: target!.pong.winner === i ? 0.08 : 0.01 });
        }
        return u > 20 && target!.pong.time + 2 < u;
      }
      return u > 180;
    }
    if (p.act === "watch") {
      target!.watchers.add(c.who);
      target!.on = true;
      ch.facing = Math.sign(target!.center.x - ch.x) || 1;
    }
    const beat = Math.floor(u / 0.8),
      wave = Math.sin((u * Math.PI) / 0.8);
    if (p.act === "wave" || p.act === "relay") {
      const active = p.act === "wave" || beat % p.members.length === i;
      ch.handsAt = active
        ? { R: { x: neck.x + 13 * sc, y: neck.y - (18 + 8 * wave) * sc } }
        : null;
    } else if (p.act === "triangle")
      ch.handsAt = {
        R: { x: p.x + (i - 1) * 4 * sc, y: neck.y + (8 + i * 3) * sc },
      };
    else if (p.act === "mirror" || p.act === "duet") {
      const other = peers.find(
        (v) => v!.id === p.members[i % 2 === 0 ? i + 1 : i - 1],
      );
      if (other) {
        ch.facing = Math.sign(other.x - ch.x) || 1;
        ch.handsAt = {
          R: { x: (ch.x + other.x) / 2, y: neck.y + (8 + wave * 12) * sc },
          L: { x: ch.x - ch.facing * 8 * sc, y: neck.y + (12 - wave * 8) * sc },
        };
      }
    }
    if (beat !== this.beat) {
      this.beat = beat;
      if (
        (p.act === "chat" || p.act === "couch") &&
        beat % 4 === 0 &&
        Math.floor(beat / 4) % p.members.length === i
      )
        c.say(
          c.personality === "competitive"
            ? "Who’s up for a challenge?"
            : c.personality === "gentle"
              ? "Glad everyone’s here."
              : "We should make something together.",
          1.6,
        );
      if (p.act === "triangle" && beat % 3 === 0 && i === 0)
        c.burst?.(p.x, neck.y + 12 * sc, 6);
    }
    return u > (["chat", "couch", "watch"].includes(p.act) ? 35 : 9);
  }
  stop(c: Ctx) {
    for (const id of this.plan.members)
      if (id !== c.who)
        c.recordActivity?.(id, this.plan.act, this.started && !this.cancelled);
    this.broadcast(c, { type: "groupCancel", session: this.plan.session });
    c.char.handsAt = null;
    c.char.handTarget = null;
    c.char.stop();
    if (this.target) {
      if (this.plan.act === "pong") {
        this.target.pong = null;
        this.target.players = [];
      }
      this.target.leaveSeat(c.who);
      this.target.watchers.delete(c.who);
      if (!this.target.watchers.size) this.target.on = false;
      if (this.target.movingBy === c.who) this.target.movingBy = null;
    }
    if (c.char.mode === "sit" && this.plan.act === "couch") c.char.standUp();
  }
}
