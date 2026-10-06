import type { ItemStroke } from './items';
/** Hinged covers and a swept page, painted on the figure's existing pixel layer. */
export function bookShape(open: number, page = 0): ItemStroke[] {
  const width = 12 + 12 * open, spine = width / 2;
  const rect = (x: number, y: number, w: number, h: number, fill: string): ItemStroke =>
    ({ pts: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], fill, color: fill, width: 0 });
  const shapes = [rect(-1,-20,width+2,21,'#354357'), rect(0,-19,width,19,'#687c95')];
  if (open > 0.05) {
    shapes.push(rect(1,-18,width-2,17,'#eee6ce'));
    shapes.push(rect(spine-0.5,-18,1,17,'#b4a98e'));
    for (const y of [-14,-10,-6]) for (const x of [2,spine+2])
      shapes.push(rect(x,y,Math.max(1,spine-4),1,'#b4a98e'));
    if (page > 0) {
      const x = spine + Math.cos(page * Math.PI) * (spine-1);
      shapes.push({pts:[[spine,-18],[x,-20-Math.sin(page*Math.PI)*3],[x,-2],[spine,-1]],fill:'#faf3dd',color:'#d3c6a5',width:0.6});
    }
  } else {
    shapes.push(rect(2,-16,8,2,'#c7d8e5'),rect(2,-12,6,1,'#c7d8e5'),rect(0,-2,width,2,'#eee6ce'));
  }
  return shapes;
}
