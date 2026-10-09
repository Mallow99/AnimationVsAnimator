import type { Character } from "./character";
import type { DepthPart } from "./render";
import type { V3 } from "./math";
import type { CharacterTemplate, Sticker } from "./character-template";

export function satchelAt(ch: Character): V3 {
  const h = ch.body.j.hip,
    sc = ch.scale;
  return {
    x: h.x - Math.cos(ch.yaw) * 6 * sc - Math.sin(ch.yaw) * 7 * sc,
    y: h.y + 2 * sc,
    z: h.z + 3 * sc,
  };
}

/** A small soft bag follows his torso and is pixelated with his whole body. */
export function satchelParts(ch: Character, open = 0, palette?: CharacterTemplate["bag"], stickers:Sticker[]=[]): DepthPart[] {
  const at = satchelAt(ch),
    neck = ch.body.j.neck,
    sc = ch.scale;
  const w = (9 + 3 * Math.abs(Math.sin(ch.yaw))) * sc,
    h = 12 * sc;
  return [
    {
      z: at.z,
      pts: [neck, { x: at.x - w, y: at.y - h }, { x: at.x + w, y: at.y + h }],
      draw(g) {
        g.lineWidth = 2 * sc;
        g.strokeStyle = "#77624a";
        g.beginPath();
        g.moveTo(neck.x + Math.cos(ch.yaw) * 4 * sc, neck.y + 3 * sc);
        g.lineTo(at.x, at.y);
        g.stroke();
        g.fillStyle = palette?.body ?? "#6f5c46";
        g.beginPath();
        g.roundRect(at.x - w / 2, at.y - 4 * sc, w, h, 2 * sc);
        g.fill();
        g.fillStyle = palette?.flap ?? "#aa9270";
        g.beginPath();
        g.roundRect(at.x - w / 2, at.y - (5 + open * 3) * sc, w, 5 * sc, sc);
        g.fill();
        g.fillStyle = palette?.clip ?? "#d8cbb0";
        g.fillRect(at.x - sc, at.y - 2 * sc, 2 * sc, 3 * sc);
        // A few tiny earned marks, rather than a growing accessory menu.
        const marks:Record<Sticker,string[]>={pencil:['001','010','100'],star:['010','111','010'],leaf:['011','110','100'],heart:['101','111','010'],bolt:['011','010','110']};
        g.fillStyle=palette?.clip??'#e1cf92';
        stickers.slice(0,3).forEach((mark,i)=>marks[mark].forEach((row,y)=>[...row].forEach((pixel,x)=>{if(pixel==='1')g.fillRect(at.x+(x-3+i*2)*sc,at.y+(y+3)*sc,sc,sc);})));
      },
    },
  ];
}
