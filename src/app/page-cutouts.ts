import type { PageCutout } from '../shared/desktop';
import type { Pet } from '../core/pet';
import type { Bounds } from '../core/physics';
interface Card extends PageCutout {
  bitmap: HTMLImageElement;
  vx: number;
  vy: number;
  age: number;
  held: boolean;
}
/** Screenshot fragments from an explicitly connected Chrome page. No page HTML is executed. */
export class PageCutouts {
  private cards: Card[] = [];
  private held: Card | null = null;
  add(cutout: PageCutout) {
    const bitmap = new Image();
    bitmap.src = cutout.image;
    this.cards.push({ ...cutout, bitmap, vx: 0, vy: 0, age: 0, held: false });
    if (this.cards.length > 12) this.cards.shift();
  }
  clear() {
    this.cards = [];
    this.held = null;
  }
  hit(x: number, y: number) {
    return (
      [...this.cards]
        .reverse()
        .find(
          (c) =>
            x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height,
        ) ?? null
    );
  }
  grab(x: number, y: number) {
    const card = this.hit(x, y);
    if (!card) return false;
    this.held = card;
    card.held = true;
    card.age = 6;
    return true;
  }
  move(x: number, y: number, vx: number, vy: number) {
    if (this.held) {
      this.held.x = x - this.held.width / 2;
      this.held.y = y - this.held.height / 2;
      this.held.vx = Math.max(-1800, Math.min(1800, vx));
      this.held.vy = Math.max(-1800, Math.min(1800, vy));
    }
  }
  release() {
    if (this.held) this.held.held = false;
    this.held = null;
  }
  update(dt: number, b: Bounds, pets: Pet[]) {
    dt = Math.min(0.05, Math.max(0, dt));
    for (const c of this.cards) {
      c.age += dt;
      if (c.held) continue;
      const pet = pets[c.owner],
        hand = pet?.char.useHand;
      if (c.age < 4 && pet && hand) {
        const at = pet.char.body.j[hand === 'R' ? 'handR' : 'handL'];
        c.x = at.x;
        c.y = at.y - c.height / 2;
        c.vx = 0;
        c.vy = 0;
        continue;
      }
      c.vy += 900 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y + c.height > b.floor) {
        c.y = b.floor - c.height;
        c.vy = Math.abs(c.vy) > 80 ? -c.vy * 0.2 : 0;
        c.vx *= Math.exp(-8 * dt);
      }
      if (c.x < b.left) {
        c.x = b.left;
        c.vx = Math.abs(c.vx) * 0.3;
      }
      if (c.x + c.width > b.right) {
        c.x = b.right - c.width;
        c.vx = -Math.abs(c.vx) * 0.3;
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    for (const c of this.cards) {
      g.save();
      g.shadowColor = '#0005';
      g.shadowBlur = 8;
      g.fillStyle = '#fff';
      g.fillRect(c.x - 3, c.y - 3, c.width + 6, c.height + 6);
      g.shadowBlur = 0;
      if (c.bitmap.complete && c.bitmap.naturalWidth)
        g.drawImage(c.bitmap, c.x, c.y, c.width, c.height);
      g.restore();
    }
  }
}
