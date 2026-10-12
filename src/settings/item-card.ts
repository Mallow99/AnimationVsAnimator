import { drawSprite, type PixelSprite } from '../core/pixel-art';

export interface ThingPreview {
  id: string; name: string; about: string;
  sprite?: PixelSprite;
  shape?: { pts: [number, number][]; color: string; width: number; fill?: string; rect?: [number, number, number, number]; radius?: number }[];
  screen?: [number, number, number, number];
}

/** Inventory cards show the actual definition, including the owner's custom artwork. */
export function thingCard(kind: ThingPreview, actions: [string, () => void][], pixels = 64) {
  const card = document.createElement('article'); card.className = 'thing-card';
  const art = document.createElement('canvas'); art.width = art.height = pixels; art.setAttribute('aria-hidden', 'true');
  const g = art.getContext('2d')!;
  const sprite = kind.sprite;
  const points = (kind.shape ?? []).flatMap((s) => s.rect ? [[s.rect[0], s.rect[1]], [s.rect[0] + s.rect[2], s.rect[1] + s.rect[3]]] as [number, number][] : s.pts);
  const x1 = sprite ? sprite.x : Math.min(0, ...points.map((p) => p[0]));
  const y1 = sprite ? sprite.y : Math.min(0, ...points.map((p) => p[1]));
  const x2 = sprite ? sprite.x + sprite.rows[0].length * sprite.pixel : Math.max(1, ...points.map((p) => p[0]));
  const y2 = sprite ? sprite.y + sprite.rows.length * sprite.pixel : Math.max(1, ...points.map((p) => p[1]));
  const fit = Math.min(54 / (x2 - x1), 54 / (y2 - y1), 2);
  g.scale(pixels / 64, pixels / 64);
  g.translate(32, 32); g.scale(fit, fit); g.translate(-(x1 + x2) / 2, -(y1 + y2) / 2);
  if (sprite) drawSprite(g, sprite);
  else {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of kind.shape ?? []) {
      g.beginPath();
      if (st.rect) g.roundRect(st.rect[0], st.rect[1], st.rect[2], st.rect[3], Math.min(st.radius ?? 0, st.rect[2] / 2, st.rect[3] / 2));
      else { st.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (st.fill) g.closePath(); }
      if (st.fill) { g.fillStyle = st.fill; g.fill(); }
      if (st.width) { g.strokeStyle = st.color; g.lineWidth = st.width; g.stroke(); }
    }
    // A TV or canvas in the flat style: its screen goes on top.
    if (kind.screen && kind.shape?.some((st) => st.fill)) {
      g.beginPath(); g.roundRect(...kind.screen, 3); g.fillStyle = kind.id === 'canvas' ? '#fff8e8' : '#22232c'; g.fill();
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
