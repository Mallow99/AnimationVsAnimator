import { Skill, type Ctx } from './context';
import { Tool, FetchItem } from '../skills';
import { Runner } from '../tv-game';
import type { Item } from '../items';

/** The device faces its player. Thumbs follow actual jumps, not a decorative mash clock. */
export class PlayHandheld extends Skill {
  readonly name = 'handheld';
  private tool = new Tool('game');
  item: Item | null = null;
  private fetch: FetchItem | null = null;
  private nextComment = 12;
  private elapsed = 0;
  private seated = false;
  private prepared = false;
  constructor(private linked = false) {
    super();
  }
  prepare(c: Ctx, dt: number): 'ready' | 'go' | 'none' {
    if (!this.prepared) {
      this.prepared = true;
      this.item = c.items.find('game');
      if (!this.item || this.item.where === 'cursor') return 'none';
      this.tool.item = this.item;
      if (this.item.where === 'world') {
        this.fetch = new FetchItem(this.item, false);
        this.fetch.start(c);
      }
    }
    const it = this.item;
    if (!it || !c.items.list.includes(it) || it.where === 'cursor' || !c.char.useHand)
      return 'none';
    if (this.fetch) {
      this.fetch.t += dt;
      if (!this.fetch.update(c, dt)) return 'go';
      this.fetch.stop(c);
      this.fetch = null;
      if (it.where === 'world') return 'none';
    }
    const result = this.tool.fetch(c, dt);
    if (result !== 'ready') return result === 'none' ? 'none' : 'go';
    if (!it.arcade) {
      it.arcade = new Runner(c.talent === 'games' ? 0.88 : 0.72);
      it.arcade.best = it.gameBest;
    }
    return 'ready';
  }
  update(c: Ctx, dt: number) {
    const result = this.prepare(c, dt);
    if (result !== 'ready') {
      if (result === 'none') c.say('I need my handheld.', 1.5);
      return result === 'none' || this.t > 25;
    }
    const it = this.item!,
      ch = c.char;
    if (it.where !== 'hand' || !['ground', 'sit'].includes(ch.mode)) return true;
    ch.stop();
    if (ch.mode === 'ground') {
      ch.sit();
      this.seated = true;
    }
    const game = it.arcade!,
      events = game.step(dt);
    this.elapsed += dt;
    it.gameBest = Math.min(9999, Math.max(it.gameBest, game.best, game.score));
    it.working = true;
    const press = game.time - game.lastPressAt < 0.12 ? 1 : 0,
      n = ch.body.j.neck,
      sc = ch.scale,
      f = ch.facing;
    ch.handsAt = {
      [it.hand]: { x: n.x + f * 7 * sc, y: n.y + 24 * sc },
      [it.hand === 'L' ? 'R' : 'L']: { x: n.x + f * 27 * sc, y: n.y + (24 - press * 1.5) * sc },
    };
    it.aim = { x: f, y: 0, z: 0 };
    it.aimLocal = null;
    c.look = 'target';
    c.lookTarget = { x: n.x + f * 18 * sc, y: n.y + 18 * sc };
    if (
      !this.linked &&
      this.elapsed > this.nextComment &&
      (events.includes('crash') || events.includes('record'))
    ) {
      this.nextComment = this.elapsed + 20;
      c.say(
        events.includes('record')
          ? 'That’s my best run!'
          : c.personality === 'competitive'
            ? 'Mistimed it. Next round.'
            : 'One more try.',
        1.6,
      );
    }
    c.mood.nudge({ boredom: -dt / 160, stress: -dt / 300 });
    return !this.linked && ((this.elapsed > 90 && events.includes('crash')) || this.elapsed > 150);
  }
  stop(c: Ctx) {
    this.fetch?.stop(c);
    c.char.handsAt = null;
    c.char.handTarget = null;
    if (this.seated && c.char.mode === 'sit') c.char.standUp();
    const it = this.item;
    if (it && c.items.list.includes(it)) {
      it.arcade = null;
      it.aim = null;
      it.working = false;
      if (it.where === 'hand' && !c.items.stow(it)) c.items.drop(it, 0, 0);
    }
  }
}
