import { bookModel } from '../core/book-model';
import {
  IDENTITY_AXES,
  modelBox,
  modelGrip,
  projectModel,
  projectedDistance,
  drawModel,
  type ModelPose,
  type PropModel,
} from '../core/prop-model';
import { cross3, smooth } from '../core/math';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('model'),
  g = canvas.getContext('2d')!,
  small = document.createElement('canvas');
const controls = ['open', 'page', 'yaw', 'pitch', 'pixel'].map((id) => $<HTMLInputElement>(id));
const [open, page, yaw, pitch, pixel] = controls,
  kind = $<HTMLSelectElement>('kind'),
  grips = $<HTMLInputElement>('grips');
let playing = false,
  start = 0,
  model: PropModel,
  pose: ModelPose;
const box: PropModel = {
  faces: modelBox({ x: -8, y: -20, z: -6 }, { x: 8, y: 0, z: 6 }, '#8b9e91', 'box'),
  grips: { top: { x: 0, y: -20, z: 0 }, carry: { x: 8, y: -10, z: 0 } },
};
function draw() {
  const a = (Number(yaw.value) * Math.PI) / 180,
    b = (Number(pitch.value) * Math.PI) / 180;
  const right = { x: Math.cos(a), y: 0, z: -Math.sin(a) },
    front = { x: Math.sin(a) * Math.cos(b), y: -Math.sin(b), z: Math.cos(a) * Math.cos(b) };
  model = kind.value === 'book' ? bookModel(Number(open.value), Number(page.value)) : box;
  pose = { right, front, down: cross3(front, right), at: { x: 460, y: 270, z: 0 }, scale: 10 };
  const p = Number(pixel.value),
    width = Math.ceil(canvas.width / p),
    height = Math.ceil(canvas.height / p);
  if (small.width !== width) small.width = width;
  if (small.height !== height) small.height = height;
  const ctx = small.getContext('2d')!;
  ctx.setTransform(1 / p, 0, 0, 1 / p, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawModel(ctx, model, pose);
  if (grips.checked)
    for (const name of kind.value === 'book' ? ['left', 'right', 'turn'] : ['carry', 'top'])
      if (model.grips[name]) {
        const at = modelGrip(model, name, pose);
        ctx.fillStyle = name === 'turn' ? '#e8ad76' : '#e9d2a0';
        ctx.fillRect(at.x - 3, at.y - 3, 6, 6);
      }
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, canvas.width, canvas.height);
}
for (const c of [...controls, grips])
  c.oninput = () => {
    playing = false;
    $('play').setAttribute('aria-pressed', 'false');
    draw();
  };
kind.onchange = () => {
  playing = false;
  open.disabled = page.disabled = kind.value !== 'book';
  $('play').setAttribute('aria-pressed', 'false');
  draw();
};
$('reader').onclick = () => {
  yaw.value = '0';
  pitch.value = '15';
  draw();
};
$('outside').onclick = () => {
  yaw.value = '145';
  pitch.value = '15';
  draw();
};
$('play').onclick = () => {
  playing = !playing;
  kind.value = 'book';
  open.disabled = page.disabled = false;
  start = performance.now();
  $('play').setAttribute('aria-pressed', String(playing));
};
canvas.onpointermove = (e) => {
  const rect = canvas.getBoundingClientRect(),
    at = {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  const faces = projectModel(model, pose),
    hit = [...faces].reverse().find((f) => projectedDistance([f], at) < 1);
  $('surface').textContent = hit
    ? `${hit.surface.replaceAll('-', ' ')} · visible surface at depth ${hit.depth.toFixed(1)}`
    : 'Outside the model silhouette.';
};
function frame(now: number) {
  if (playing) {
    const t = ((now - start) / 1000) % 10;
    open.value = String(t < 1 ? smooth(t) : t < 8 ? 1 : 1 - smooth(t - 8));
    page.value = String(t > 4 && t < 5 ? t - 4 : 0);
    draw();
  }
  requestAnimationFrame(frame);
}
draw();
requestAnimationFrame(frame);
