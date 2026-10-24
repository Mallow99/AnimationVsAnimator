export interface Hsl { h: number; s: number; l: number }
const bound = (n: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0));
export function hexToHsl(hex: string): Hsl {
  const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;
  let h=0;
  if(d) h=hi===r?((g-b)/d)%6:hi===g?(b-r)/d+2:(r-g)/d+4;
  return {h:(h*60+360)%360,s:d?d/(1-Math.abs(2*l-1))*100:0,l:l*100};
}
export function hslToHex({h,s,l}: Hsl): string {
  h=((Number.isFinite(h)?h:0)%360+360)%360;s=bound(s,100)/100;l=bound(l,100)/100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
