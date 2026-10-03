import { drawSprite, type PixelSprite } from '../core/pixel-art';

export interface ThingPreview {
  id: string; name: string; about: string;
  sprite?: PixelSprite;
  shape?: { pts: [number, number][]; color: string; width: number }[];
}

/** Inventory cards show the actual definition, including the owner's custom artwork. */
export function thingCard(kind: ThingPreview, actions: [string, () => void][]) {
  const card = document.createElement('article'); card.className = 'thing-card';
  const art = document.createElement('canvas'); art.width = art.height = 64; art.setAttribute('aria-hidden', 'true');
  const g = art.getContext('2d')!;
  const sprite = kind.sprite, points = kind.shape?.flatMap((s) => s.pts) ?? [];
  const x1 = sprite ? sprite.x : Math.min(0, ...points.map((p) => p[0]));
  const y1 = sprite ? sprite.y : Math.min(0, ...points.map((p) => p[1]));
  const x2 = sprite ? sprite.x + sprite.rows[0].length * sprite.pixel : Math.max(1, ...points.map((p) => p[0]));
  const y2 = sprite ? sprite.y + sprite.rows.length * sprite.pixel : Math.max(1, ...points.map((p) => p[1]));
  const fit = Math.min(54 / (x2 - x1), 54 / (y2 - y1), 2);
  g.translate(32, 32); g.scale(fit, fit); g.translate(-(x1 + x2) / 2, -(y1 + y2) / 2);
  if (sprite) drawSprite(g, sprite);
  else {
    g.lineCap = 'square'; g.lineJoin = 'miter';
    for (const stroke of kind.shape ?? []) {
      g.strokeStyle = stroke.color; g.lineWidth = stroke.width; g.beginPath();
      stroke.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    }
  }
  const info = document.createElement('div'); info.className = 'thing-info';
  const title = document.createElement('strong'); title.textContent = kind.name;
  const about = document.createElement('p'); about.textContent = kind.about;
  const buttons = document.createElement('div'); buttons.className = 'btns';
  for (const [label, act] of actions) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost small'; button.textContent = label;
    button.setAttribute('aria-label', `${label}: ${kind.name}`); button.addEventListener('click', act); buttons.append(button);
  }
  info.append(title, about, buttons); card.append(art, info); return card;
}
