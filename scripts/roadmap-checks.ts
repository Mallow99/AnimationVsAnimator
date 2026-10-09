import assert from "node:assert/strict";
import { Pet, DEFAULT_CONFIG } from "../src/core/pet";
import { companionConfig } from "../src/core/config";
import { Skill } from "../src/core/skills/context";
import { DrawTool } from "../src/core/skills/draw-tool";
import {
  DrawFurniture,
  DeskWork,
  RefineProject,
  SortTools,
} from "../src/core/skills/workshop";
import { MoveFurniture, arrangement } from "../src/core/skills/arrange";
import { GroupActivity, groupPlan } from "../src/core/skills/group";
import { OverlayTools } from "../src/core/overlay-tools";
import { eraseStrokes, wipeDoodles } from "../src/core/sponge";
import { Pong } from "../src/core/pong";
import { offlineReply } from "../src/core/brains/offline";
import { propActions } from "../src/core/capabilities";
import { PlayHandheld } from "../src/core/skills/handheld";
import { FriendlyMoment } from "../src/core/skills/friendly-moment";
import { LifeRhythm } from "../src/core/life-rhythm";
import { activitiesFor } from "../src/app/activities";
import { drawCharacter, type Ctx2D } from "../src/core/render";
import { satchelParts } from "../src/core/satchel";
const bounds = { left: 0, right: 1400, top: 0, floor: 800 },
  dt = 1 / 120;
let seed = 21;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`PASS ${name}`);
};
function fixture(n = 1) {
  const cfg = {
    ...structuredClone(DEFAULT_CONFIG),
    mind: "offline" as const,
    windows: false,
    dailyRhythm: false,
  };
  const a = new Pet(bounds, cfg, { identity: "figure-0" }),
    pets = [a];
  for (let i = 1; i < n; i++)
    pets.push(
      new Pet(bounds, companionConfig(cfg, i), {
        props: a.props,
        identity: `figure-${i}`,
      }),
    );
  for (const [i, p] of pets.entries()) {
    p.char.body.translate(360 + i * 45 - p.char.x, 0);
    p.paused = true;
  }
  for (let i = 0; i < 360; i++) for (const p of pets) p.update(dt);
  for (const p of pets) {
    p.mind.reset(p.ctx);
    p.mind.holdUntil = Infinity;
  }
  return pets;
}
function run(p: Pet, s: Skill, seconds = 45) {
  s.start(p.ctx);
  let done = false;
  for (let i = 0; i < seconds / dt; i++) {
    s.t += dt;
    if (s.update(p.ctx, dt)) {
      done = true;
      break;
    }
    p.update(dt);
  }
  s.stop(p.ctx);
  return done;
}
function settle(p: Pet, seconds = 2) {
  for (let i = 0; i < seconds / dt; i++) p.update(dt);
}
test("sponge splits a crossing stroke and leaves distant work intact", () => {
  const strokes = [
      [
        { x: 0, y: 20 },
        { x: 100, y: 20 },
      ],
    ],
    cut = eraseStrokes(strokes, { x: 50, y: 20 }, 10);
  assert.equal(cut.length, 2);
  assert.equal(cut[0].at(-1)!.x, 40);
  assert.equal(cut[1][0].x, 60);
  const near = { strokes, color: "#ffffff", done: true, born: 0 },
    far = {
      ...near,
      strokes: [
        [
          { x: 0, y: 200 },
          { x: 100, y: 200 },
        ],
      ],
    };
  wipeDoodles([near, far], { x: 40, y: 20 }, { x: 60, y: 20 }, 10);
  assert.deepEqual(far.strokes, [
    [
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ],
  ]);
});
test("satchel stores large tools, migrates legacy slots and restores loose positions and ammo", () => {
  const [p] = fixture();
  for (const id of [
    "katana",
    "gun",
    "mace",
    "bow",
    "book",
    "sponge",
    "eraser",
    "paint-bucket",
    "handheld",
  ])
    assert(p.items.give(id, p.char));
  assert.equal(p.items.onHim.filter((i) => i.where === "belt").length, 10);
  const gun = p.items.list.find((i) => i.def.id === "gun")!;
  gun.ammo = 2;
  gun.at = { x: 700, y: 700, z: 0 };
  gun.dir = { x: 1, y: 0, z: 0 };
  p.items.drop(gun, 0, 0);
  const q = fixture()[0];
  q.load(p.save());
  const saved = q.items.list.find((i) => i.def.id === "gun")!;
  assert.equal(saved.where, "world");
  assert.equal(saved.at.x, 700);
  assert.equal(saved.ammo, 2);
  q.items.load(
    [
      { id: "pen", slot: 3 },
      { id: "katana", slot: 2 },
    ],
    q.char,
    ["pen", "katana"],
  );
  assert.equal(q.items.belt[2]?.def.id, "katana");
  assert.equal(q.items.belt[3]?.def.id, "pen");
});
test("desk blueprint traces onto paper and survives reload", () => {
  const [p] = fixture(),
    desk = p.props.spawn("desk", 420, 730, 1)!;
  settle(p);
  assert(propActions(desk.def!).includes("drawhere"));
  assert(run(p, new DeskWork(desk)));
  assert.equal(desk.art?.title, "katana blueprint");
  assert(desk.art?.shape.length);
  const q = fixture()[0];
  q.load(p.save());
  assert.equal(q.props.placed[0].art?.title, "katana blueprint");
});
test("a drawn katana colors and polishes into the same durable object with resumable progress", () => {
  const [p] = fixture();
  assert(run(p, new DrawTool("katana")));
  const ink = p.items.list.find((i) => i.ink)!;
  assert(ink, "no ink katana emerged");
  ink.ammo = 2;
  p.props.spawn("workbench", p.char.x + 30, 730, 1);
  settle(p);
  const uid = ink.uid;
  const refine = new RefineProject();
  refine.start(p.ctx);
  for (let i = 0; i < 4 / dt; i++) {
    refine.t += dt;
    refine.update(p.ctx, dt);
    p.update(dt);
  }
  refine.stop(p.ctx);
  assert(
    ink.ink!.progress > 0 && ink.ink!.progress < 1,
    `progress ${ink.ink?.progress}`,
  );
  const q = fixture()[0];
  q.load(p.save());
  const resumed = q.items.list.find((i) => i.ink)!;
  assert.equal(resumed.ink?.progress, ink.ink?.progress);
  assert(run(p, new RefineProject(), 30));
  assert.equal(ink.uid, uid);
  assert.equal(
    ink.def.id,
    "katana",
    JSON.stringify({
      progress: ink.ink,
      mode: p.char.mode,
      x: p.char.x,
      bench: p.props.placed.map((t) => ({
        center: t.center,
        tilt: t.tilt,
        held: t.held,
      })),
      skill: p.mind.skill?.name,
    }),
  );
  assert.equal(ink.ink, undefined);
  assert.equal(ink.ammo, 2);
  assert.equal(p.items.list.filter((i) => i.def.id === "katana").length, 1);
  const r = fixture()[0];
  r.load(p.save());
  assert.equal(r.items.list.filter((i) => i.def.id === "katana").length, 1);
});
test("furniture blueprints emerge as working ink furniture and reload without duplication", () => {
  for (const id of ["tv", "chair", "couch", "desk"]) {
    const [p] = fixture();
    const skill = new DrawFurniture(id);
    assert(run(p, skill, 60), id);
    assert(skill.object, `${id} did not emerge`);
    assert.equal(skill.object!.ink?.source, id);
    assert.equal(skill.object!.def!.use, p.props.defs.get(id)!.use);
    const q = fixture()[0];
    q.load(p.save());
    assert.equal(q.props.placed.length, 1);
    assert.equal(q.props.placed[0].ink?.source, id);
  }
});
test("ink expiry pauses in the satchel, in hands and under occupants; zero disables expiry", () => {
  const [p] = fixture();
  run(p, new DrawTool("katana"));
  const item = p.items.list.find((i) => i.ink)!;
  item.ink!.remaining = 0.1;
  settle(p, 0.5);
  assert(p.items.list.includes(item));
  item.at = { x: 700, y: 740, z: 0 };
  p.items.drop(item, 0, 0);
  settle(p, 0.3);
  assert(!p.items.list.includes(item));
  const couch = p.props.spawn("couch", 600, 744, 1)!;
  couch.ink = { source: "couch", progress: 0, remaining: 0.05 };
  couch.claimSeat("occupant", 500);
  settle(p, 0.2);
  assert(p.props.things.includes(couch));
  couch.leaveSeat("occupant");
  settle(p, 0.2);
  assert(!p.props.things.includes(couch));
  p.config.inkLifetime = 0;
  run(p, new DrawTool("katana"));
  const forever = p.items.list.find((i) => i.ink)!;
  assert.equal(forever.ink?.remaining, -1);
});
test("animator bucket colors once and eraser removes only ink objects", () => {
  const [p] = fixture();
  run(p, new DrawTool("katana"));
  const item = p.items.list.find((i) => i.ink)!;
  item.at = { x: 600, y: 690, z: 0 };
  p.items.drop(item, 0, 0);
  const tools = new OverlayTools(() => [p]);
  tools.pull(p, "item", "paint-bucket", { x: 600, y: 690 });
  assert.equal(item.ink!.progress, 0, "picking up paint must be passive");
  tools.using = true; tools.move({x:600,y:690},{x:0,y:0});
  assert.equal(item.ink!.progress, 0.6);
  tools.release({ x: 850, y: 690 }, { x: 0, y: 0 });
  tools.pull(p, "item", "eraser", { x: 600, y: 690 });
  assert(p.items.list.includes(item), "picking up an eraser must be passive");
  tools.using = true; tools.move({x:600,y:690},{x:0,y:0});
  assert(!p.items.list.includes(item));
  assert(p.items.list.some((i) => i.def.id === "pen"));
});
test("five distinct couch seats reject a sixth and recenter when members leave", () => {
  const [p] = fixture(),
    couch = p.props.spawn("couch", 600, 740, 1)!;
  for (let i = 0; i < 5; i++) assert(couch.claimSeat(String(i), 500 + i * 40));
  assert(!couch.claimSeat("sixth", 700));
  assert.equal(
    new Set([...couch.sitters.keys()].map((id) => couch.seatFor(id)!.x)).size,
    5,
  );
  for (let i = 1; i < 5; i++) couch.leaveSeat(String(i));
  assert.equal(couch.seatFor("0")!.x, couch.seatAt!.x);
});
function groupFixture(n: number) {
  const pets = fixture(n),
    wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const remotes = pets.map((p) => ({
    view: () => wire(p.view()),
    receive: (m: any, from: any) => p.receive(wire(m), from),
  }));
  for (const [i, p] of pets.entries()) {
    p.others = remotes.filter((_, j) => i !== j);
    p.paused = false;
  }
  return pets;
}
test("JSON group invitations coordinate 2–5 roles and release on interruption", () => {
  for (const [n, act] of [
    [2, "duet"],
    [3, "triangle"],
    [4, "mirror"],
    [5, "relay"],
  ] as const) {
    const pets = groupFixture(n);
    pets[0].command(`do:group:${act}`);
    let performing = false;
    for (let i = 0; i < 20 / dt; i++) {
      for (const p of pets) p.update(dt);
      if (pets.every((p) => p.view().group?.phase === "do")) {
        performing = true;
        break;
      }
    }
    assert(
      performing,
      `${n}/${act} never synchronized: ${pets.map((p) => JSON.stringify(p.view().group)).join(" ")}`,
    );
    pets.at(-1)!.mind.reset(pets.at(-1)!.ctx);
    for (let i = 0; i < 1 / dt; i++) for (const p of pets) p.update(dt);
    assert(pets.every((p) => !(p.mind.skill instanceof GroupActivity)));
    assert(pets.every((p) => p.char.handsAt === null));
  }
});
test("five figures can actually group onto a couch and clean up seat reservations", () => {
  const pets = groupFixture(5),
    couch = pets[0].props.spawn("couch", 450, 740, 1)!;
  for (const p of pets) p.paused = true;
  settle(pets[0]);
  for (const p of pets) p.paused = false;
  pets[0].command("do:group:couch");
  let seated = false;
  for (let i = 0; i < 20 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (
      pets.every((p) => p.char.mode === "sit" && p.view().group?.phase === "do")
    ) {
      seated = true;
      break;
    }
  }
  assert(
    seated,
    `not all seated ${pets.map((p) => p.char.mode + " " + p.view().group?.phase)}`,
  );
  assert.equal(couch.sitters.size, 5);
  for (let i = 0; i < 2 / dt; i++) for (const p of pets) p.update(dt);
  for (const p of pets)
    assert(
      Math.abs(p.char.body.j.hip.y - couch.seatFor(p.ctx.who)!.y) < 10,
      `floating sitter: ${p.char.body.j.hip.y} seat=${couch.seatFor(p.ctx.who)!.y}`,
    );
  pets[0].mind.reset(pets[0].ctx);
  for (let i = 0; i < 0.5 / dt; i++) for (const p of pets) p.update(dt);
  assert.equal(couch.sitters.size, 4, "the remaining conversation lost its seats");
  assert(pets.slice(1).every(p=>p.mind.skill instanceof GroupActivity));
  for(let i=0;i<50/dt;i++)for(const p of pets)p.update(dt);
  assert.equal(couch.sitters.size,0,"completed conversation leaked seats");
  assert(pets.every(p=>!(p.mind.skill instanceof GroupActivity)));
});
test("TV moves through a clear route, faces the couch, and restores its rigid arrangement", () => {
  const [p] = fixture();
  const couch = p.props.spawn("couch", 700, 744, 1)!,
    tv = p.props.spawn("tv", 450, 720, 1)!;
  settle(p);
  assert.notEqual(arrangement(p.ctx, tv, couch), null);
  const before = tv.center.x;
  assert(run(p, new MoveFurniture(), 35));
  assert(Math.abs(tv.center.x - before) > 15);
  assert.equal(tv.movingBy, null);
  assert.equal(tv.facing, 1);
  const q = fixture()[0];
  q.load(p.save());
  const reloaded = q.props.placed.find((t) => t.def?.id === "tv")!;
  assert(Math.abs(reloaded.center.x - tv.center.x) < 0.01);
  assert.equal(reloaded.facing, tv.facing);
  tv.watchers.add("busy");
  const at = tv.center.x;
  run(p, new MoveFurniture(), 10);
  assert(Math.abs(tv.center.x - at) < 1);
});
test("Pong scores a complete match, rematches and accepts direct human paddle control", () => {
  const pong = new Pong(["a", "b"], [0.9, 0.2], () => 0.2);
  for (let i = 0; i < 600 / dt && pong.winner === null; i++) pong.step(dt);
  assert.notEqual(pong.winner, null);
  assert.equal(Math.max(...pong.score), 5);
  pong.rematch();
  assert.deepEqual(pong.score, [0, 0]);
  assert.equal(pong.winner, null);
  pong.user = 0;
  pong.moveUser(0.2);
  pong.step(dt);
  assert.equal(pong.paddles[0], 0.2);
});
test("real clock notices a return after idle and optional daily rhythm leaves commands responsive", () => {
  const [p] = fixture(),
    clock = new LifeRhythm();
  const lines: string[] = [];
  p.ctx.say = (s) => lines.push(s);
  clock.receive(p.ctx, { hour: 23, idleSeconds: 180 });
  clock.receive(p.ctx, { hour: 23, idleSeconds: 0 });
  assert(lines.some((s) => s.includes("Welcome back")));
  const energy = p.mood.s.energy;
  clock.step(p.ctx, 30);
  assert(p.mood.s.energy < energy);
  clock.receive(p.ctx, { hour: 9, idleSeconds: 0 });
  p.mood.asleep = true;
  p.mood.s.energy = 0.9;
  clock.step(p.ctx, 1);
  assert.equal(p.mood.asleep, false);
});
test("new actions are understood offline and pair memories survive reload", () => {
  const [p] = fixture();
  for (const [text, doName] of [
    ["draw a katana", "drawitem:katana"],
    ["draw a TV", "drawprop:tv"],
    ["make a blueprint", "deskwork"],
    ["polish it", "refine"],
    ["move the TV to the couch", "arrange"],
    ["wave relay", "group:relay"],
    ["play Pong", "pong"],
    ["play a handheld", "handheld"],
  ])
    assert(
      offlineReply(p.ctx, text).plan.some((s) => "do" in s && s.do === doName),
      text,
    );
  p.ctx.recordActivity!("friend", "wave", true);
  p.ctx.recordActivity!("friend", "argument", false);
  p.ctx.relationship!("friend").vulnerable.thrust = 3;
  const q = fixture()[0];
  q.load(p.save());
  assert.equal(q.ctx.relationship!("friend").vulnerable.thrust, 3);
  assert.equal(q.ctx.relationship!("friend").activities.wave, 1);
});
test("offline multi-step group plans publish their actual active session", () => {
  const pets = groupFixture(3);
  pets[0].mind.perform(
    pets[0].ctx,
    [{ do: "group:triangle" }, { say: "Done." }],
    "offline request",
  );
  let together = false;
  for (let i = 0; i < 20 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (pets.every((p) => p.view().group?.phase === "do")) {
      together = true;
      break;
    }
  }
  assert(together, "group plan did not expose its nested session");
});
test("companions added later synchronize using their own clocks", () => {
  const pets = groupFixture(3);
  pets[0].ctx.world.time += 600;
  pets[1].ctx.world.time += 300;
  pets[0].command("do:group:triangle");
  let posed = false;
  for (let i = 0; i < 20 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (pets.every((p) => p.char.handsAt)) {
      posed = true;
      break;
    }
  }
  assert(posed, "late companions waited for the leader’s absolute clock");
  for (let i = 0; i < 12 / dt; i++) for (const p of pets) p.update(dt);
  assert(pets.every((p) => !p.view().group));
});
test("group invitations refuse a busy or sleeping member without stealing an activity", () => {
  const pets = groupFixture(3);
  pets[1].mind.command(pets[1].ctx, "read");
  pets[1].update(dt);
  pets[2].mood.asleep = true;
  pets[0].command("do:group:triangle");
  for (let i = 0; i < 2 / dt; i++) for (const p of pets) p.update(dt);
  assert.equal(pets[0].view().group, undefined);
  assert.equal(pets[1].mind.skill?.name, "read");
  assert(pets[2].mood.asleep);
});
test("two figures carry the TV together and release when the user grabs it", () => {
  const pets = groupFixture(2),
    a = pets[0],
    tv = a.props.spawn("tv", 500, 720, 1)!;
  a.props.spawn("couch", 800, 744, 1);
  for (const p of pets) p.paused = true;
  settle(a);
  for (const p of pets) p.paused = false;
  const before = tv.center.x;
  a.command("do:carrytogether");
  let moved = false;
  for (let i = 0; i < 25 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (Math.abs(tv.center.x - before) > 10) {
      moved = true;
      break;
    }
  }
  assert(
    moved,
    `carry did not move: ${pets.map((p) => p.view().group?.phase)}`,
  );
  tv.grab(tv.center.x, tv.center.y);
  for (let i = 0; i < 0.2 / dt; i++) for (const p of pets) p.update(dt);
  assert.equal(tv.movingBy, null);
  assert(pets.every((p) => p.view().group === undefined));
  assert(tv.held, "skill released the user’s hold");
  tv.release();
});
test("two companions complete Pong with a third watching the same live TV state", () => {
  const pets = groupFixture(3),
    a = pets[0],
    tv = a.props.spawn("tv", 260, 720, 1)!;
  for (const p of pets) p.paused = true;
  settle(a);
  for (const p of pets) p.paused = false;
  // Keep one friend available as a spectator instead of a player.
  pets[2].mood.asleep = true;
  a.command("do:pong");
  let game: Pong | null = null;
  for (let i = 0; i < 20 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (tv.pong) {
      game = tv.pong;
      break;
    }
  }
  assert(game, "Pong session did not start");
  pets[2].mood.asleep = false;
  pets[2].command("do:watchtv");
  let winner = false;
  for (let i = 0; i < 185 / dt; i++) {
    for (const p of pets) p.update(dt);
    if (game!.winner !== null) {
      winner = true;
      break;
    }
  }
  assert(winner, `no winner: ${game!.score}`);
  assert(tv.watchers.has(pets[2].ctx.who), "third figure never watched");
  assert.equal(Math.max(...game!.score), 5);
  pets[0].mind.reset(pets[0].ctx);
  for (let i = 0; i < 0.2 / dt; i++) for (const p of pets) p.update(dt);
  assert.equal(tv.pong, null);
  assert(tv.on, "spectator lost the show when players left");
});
test("handheld runs real game state and putting it away releases both hands", () => {
  const [p] = fixture();
  p.items.give("handheld", p.char);
  const game = new PlayHandheld();
  game.start(p.ctx);
  for (let i = 0; i < 10 / dt; i++) {
    game.t += dt;
    game.update(p.ctx, dt);
    p.update(dt);
  }
  const item = p.items.list.find((i) => i.def.id === "handheld")!;
  assert(item.arcade);
  assert(item.arcade!.time > 5);
  assert(p.char.handsAt);
  game.stop(p.ctx);
  assert.equal(item.arcade, null);
  assert.equal(p.char.handsAt, null);
  assert.equal(item.where, "belt");
});
test("tool shelf sorts loose tools and peer gifts preserve one owner and project state", () => {
  const [p] = fixture(),
    shelf = p.props.spawn("storage", 550, 774, 1)!;
  const gun = p.items.spawn("gun", { x: 370, y: 790 }, 1)!;
  gun.ammo = 3;
  settle(p);
  assert(run(p, new SortTools(), 50));
  assert(Math.abs(gun.at.x - shelf.center.x) < 70, `not stored ${gun.at.x}`);
  const pets = groupFixture(2),
    a = pets[0],
    b = pets[1];
  a.items.give("book", a.char);
  a.paused = true;
  b.paused = true;
  const pass = new FriendlyMoment("pass");
  run(a, pass, 12);
  assert(!a.items.list.some((i) => i.def.id === "book"));
  assert.equal(b.items.list.filter((i) => i.def.id === "book").length, 1);
});
test("moving platforms keep the body on screen between physics steps", () => {
  const [p] = fixture();
  p.char.support = 991;
  p.char.setPlatforms([{ id: 991, x1: 300, x2: 600, y: 780 }]);
  p.char.setPlatforms([{ id: 991, x1: -900, x2: -600, y: 0 }]);
  const hip = p.char.body.j.hip;
  assert(hip.x >= bounds.left && hip.y >= bounds.top);
});
test("advertised custom furniture draws, refines and retains its identity", () => {
  const [p] = fixture();
  const raw = {
    ...p.props.defs.get("chair")!,
    type: "prop",
    id: "reading-seat",
    name: "Reading seat",
    use: "none",
    actions: ["sit", "move"],
  };
  p.props.addDefs([raw]);
  assert(
    offlineReply(p.ctx, "draw a reading seat").plan.some(
      (s) => "do" in s && s.do === "drawprop:reading-seat",
    ),
  );
  const drawing = new DrawFurniture("reading-seat");
  assert(run(p, drawing, 60));
  const chair = drawing.object!,
    identity = chair.n;
  assert(chair.seatAt && propActions(chair.def!).includes("sit"));
  p.props.spawn("workbench", p.char.x + 30, 730, 1);
  settle(p);
  assert(run(p, new RefineProject(), 40));
  assert.equal(chair.n, identity);
  assert.equal(chair.ink, undefined);
  assert.equal(chair.def!.id, "reading-seat");
});
test("Pong's optional console requirement checks real loose peer consoles", () => {
  const pets = groupFixture(2),
    a = pets[0],
    tv = a.props.spawn("tv", 260, 720, 1)!;
  a.config.consoleRequired = true;
  for (const p of pets) p.paused = true;
  settle(a);
  for (const p of pets) p.paused = false;
  a.command("do:pong");
  for (let i = 0; i < 20 / dt; i++) for (const p of pets) p.update(dt);
  assert.equal(tv.pong, null);
  pets[1].items.spawn(
    "console",
    { x: tv.center.x + 30, y: bounds.floor - 20 },
    1,
  );
  for (let i = 0; i < 1 / dt; i++) for (const p of pets) p.update(dt);
  assert(tv.consoleConnected);
  a.command("do:pong");
  for (let i = 0; i < 20 / dt && !tv.pong; i++)
    for (const p of pets) p.update(dt);
  assert(tv.pong);
});
test("specialty roles favor a free game expert over a nearer non-expert", () => {
  const pets = groupFixture(4);
  pets[3].config.personality = "adventurous";
  const tv = pets[0].props.spawn("tv", 260, 720, 1)!;
  const plan = groupPlan(pets[0].ctx, "pong", tv)!;
  assert.equal(plan.members[1], pets[3].ctx.who);
});
test("satchel and custom accessory styles cannot thin later body strokes", () => {
  const [p] = fixture();
  const strokes: { width: number; color: string }[] = [];
  const stack: { lineWidth: number; strokeStyle: string }[] = [];
  const g = {
    lineWidth: 1, strokeStyle: "", fillStyle: "", lineCap: "round", lineJoin: "round",
    save() { stack.push({ lineWidth: this.lineWidth, strokeStyle: this.strokeStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, fillRect() {}, roundRect() {},
    stroke() { strokes.push({ width: this.lineWidth, color: this.strokeStyle }); },
  };
  // Put the satchel behind the front limbs: the draw/sit depth order that exposed the regression.
  for (const j of p.char.body.points) j.z = 20;
  p.char.body.j.hip.z = 0; p.char.body.j.neck.z = 0;
  for (const yaw of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
    p.char.yaw = yaw; strokes.length = 0;
    drawCharacter(g as unknown as Ctx2D, p.char, { ...p.config.look, outline: false, lineWidth: 7 }, [
      ...satchelParts(p.char), { z: 4, draw(ctx) { ctx.lineWidth = 0.5; ctx.strokeStyle = "#abcdef"; } },
    ]);
    const body = strokes.filter(s => s.color !== "#77624a");
    assert.equal(body.length, 5);
    assert(body.every(s => s.width === 7 * p.char.scale));
    assert.equal(g.lineWidth, 1);
    assert.equal(stack.length, 0);
  }
});
test("Cancel restores an owned item and discards unplaced supplies", () => {
  const pets = fixture(2), p = pets[0], tools = new OverlayTools(() => pets);
  const gun = p.items.give("gun", p.char)!; gun.ammo = 2;
  const slot = gun.slot, count = p.items.list.length;
  assert(tools.beginItem(p, gun, { x: 600, y: 200 }));
  tools.move({ x: 700, y: 250 }, { x: 0, y: 0 });
  assert(tools.cancel());
  assert.equal(gun.where, "belt"); assert.equal(gun.slot, slot); assert.equal(gun.ammo, 2);
  assert.equal(p.items.list.length, count); assert(!p.userWeaponControlled); assert(!gun.cursorControlled);
  assert(tools.pull(p, "item", "book", { x: 500, y: 200 }));
  assert(tools.cancel()); assert.equal(p.items.list.length, count);
  const furniture = p.props.placed.length;
  assert(tools.pull(p, "prop", "chair", { x: 500, y: 200 }));
  assert(tools.cancel()); assert.equal(p.props.placed.length, furniture);
  p.items.toHand(gun, "L");
  assert(tools.beginItem(p, gun, { x: 600, y: 200 })); assert(tools.cancel());
  assert.equal(gun.where, "hand"); assert.equal(gun.hand, "L");
  assert(tools.beginItem(p, gun, { x: 600, y: 200 }));
  pets.shift();
  assert(tools.cancel());
  assert(!p.items.list.includes(gun)); assert(pets[0].items.onHim.includes(gun));
  assert.equal(gun.ammo, 2);
});
test("a user-controlled tool cannot be snatched during prolonged use", () => {
  const [p] = fixture(), tools = new OverlayTools(() => [p]), pen = p.items.onHim[0];
  assert(tools.beginItem(p, pen, p.char.body.j.handR));
  p.paused = false;
  for (let i = 0; i < 35 / dt; i++) p.update(dt);
  assert.equal(pen.where, "cursor");
  assert(!p.mind.weigh(p.ctx).some(a => a.name === "askback"));
  assert(tools.cancel());
});
test("activity choices explain missing requirements and seated leaders can invite", () => {
  const [p] = fixture();
  let actions = activitiesFor(p);
  assert(actions.find(a => a.command === "deskwork")!.needs?.includes("desk"));
  assert(actions.find(a => a.command === "group:relay")!.needs?.includes("5"));
  assert(!actions.find(a => a.command === "drawitem:katana")!.needs);
  p.props.spawn("desk", 700, 720, 1);
  assert(!activitiesFor(p).find(a => a.command === "deskwork")!.needs);
  const pets = groupFixture(2), a = pets[0];
  a.char.sit();
  assert(groupPlan(a.ctx, "wave"));
  a.command("do:group:wave");
  assert.equal(a.char.mode, "ground");
  a.update(dt);
  assert.equal(a.mind.activeSkill?.name, "group");
});
test("the figure menu stays short and furniture actions target the clicked object", () => {
  const [p] = fixture();
  let opened = 0;
  p.onSatchel = () => { opened++; }; p.onActivities = () => {}; p.onSupplies = () => {};
  p.command("hear:open bag"); assert.equal(opened, 1);
  p.command("hear:show your inventory!"); assert.equal(opened, 2);
  for (const def of p.items.defs.values()) p.items.give(def.id, p.char);
  assert(p.contextMenu(p.char.body.j.head.x, p.char.body.j.head.y));
  const menu = () => (p as unknown as { menu: { rows: { label: string; act: () => void }[] } }).menu;
  assert(menu().rows.some(r => r.label === "Open bag"));
  assert(!menu().rows.some(r => r.label.startsWith("Take ")));
  assert(menu().rows.length <= 5);
  const first = p.props.spawn("desk", 700, 720, 1)!, second = p.props.spawn("desk", 950, 720, 1)!;
  assert(p.contextMenu(second.center.x, second.center.y));
  menu().rows.find(r => r.label === "Make a blueprint here")!.act();
  p.paused = false; p.update(dt);
  assert.equal(p.mind.activeSkill?.name, "deskwork");
  assert.equal((p.mind.activeSkill as unknown as { desk: unknown }).desk, second);
  assert.notEqual((p.mind.activeSkill as unknown as { desk: unknown }).desk, first);
});
console.log(`${passed} roadmap checks passed`);
