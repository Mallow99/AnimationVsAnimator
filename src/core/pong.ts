/** Real normalized court physics, independent of rendering and figure animation. */
export class Pong {
  ball = { x: 0.5, y: 0.5, vx: 0.62, vy: 0.28 };
  paddles: [number, number] = [0.5, 0.5];
  score: [number, number] = [0, 0];
  winner: 0 | 1 | null = null;
  rounds = 0;
  time = 0;
  user: 0 | 1 | null = null;
  private serve = 0.5;
  private aim: [number, number] = [0.5, 0.5];
  private think = 0;
  constructor(
    readonly players: [string, string],
    readonly skills: [number, number] = [0.65, 0.65],
    private random: () => number = Math.random,
  ) {}
  moveUser(y: number) {
    if (this.user !== null && Number.isFinite(y))
      this.paddles[this.user] = Math.max(0.1, Math.min(0.9, y));
  }
  rematch() {
    this.score = [0, 0];
    this.winner = null;
    this.rounds++;
    this.ball = {
      x: 0.5,
      y: 0.5,
      vx: this.rounds % 2 ? -0.62 : 0.62,
      vy: 0.28,
    };
    this.serve = 0.6;
  }
  step(dt: number) {
    if (this.winner !== null || !(dt > 0) || !Number.isFinite(dt)) return;
    // Substeps keep a fast ball from tunneling past paddles at slow render rates.
    const n = Math.ceil(dt / (1 / 120)),
      h = dt / n;
    for (let k = 0; k < n; k++) this.tick(h);
  }
  private tick(dt: number) {
    if (this.winner !== null) return;
    this.time += dt;
    if (this.time >= this.think) {
      this.think = this.time + 0.12;
      for (const side of [0, 1] as const)
        this.aim[side] = Math.max(
          0.1,
          Math.min(
            0.9,
            this.ball.y + (this.random() - 0.5) * (1 - this.skills[side]) * 0.7,
          ),
        );
    }
    for (const side of [0, 1] as const)
      if (side !== this.user) {
        const speed = (0.35 + this.skills[side] * 0.6) * dt;
        this.paddles[side] += Math.max(
          -speed,
          Math.min(speed, this.aim[side] - this.paddles[side]),
        );
      }
    if (this.serve > 0) {
      this.serve -= dt;
      return;
    }
    const b = this.ball,
      old = b.x;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < 0.015) {
      b.y = 0.03 - b.y;
      b.vy = Math.abs(b.vy);
    } else if (b.y > 0.985) {
      b.y = 1.97 - b.y;
      b.vy = -Math.abs(b.vy);
    }
    for (const side of [0, 1] as const) {
      const edge = side ? 0.94 : 0.06;
      if (
        (side
          ? b.vx > 0 && old <= edge && b.x >= edge
          : b.vx < 0 && old >= edge && b.x <= edge) &&
        Math.abs(b.y - this.paddles[side]) <= 0.115
      ) {
        b.x = edge;
        b.vx = (side ? -1 : 1) * Math.min(1.25, Math.abs(b.vx) * 1.06);
        b.vy = (b.y - this.paddles[side]) * 5;
      }
    }
    if (b.x < 0 || b.x > 1) {
      const side = b.x < 0 ? 1 : 0;
      this.score[side]++;
      if (this.score[side] >= 5) {
        this.winner = side;
        return;
      }
      this.ball = {
        x: 0.5,
        y: 0.5,
        vx: side ? 0.62 : -0.62,
        vy: (this.random() - 0.5) * 0.5,
      };
      this.serve = 0.6;
    }
  }
}
export function paintPong(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pong: Pong,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.fillStyle = "#202b32";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#ddd8c4";
  for (let i = 0; i < 10; i++) g.fillRect(x + w / 2, y + (i * h) / 10, 1, 3);
  for (const side of [0, 1] as const)
    g.fillRect(
      x + (side ? 0.93 : 0.05) * w,
      y + (pong.paddles[side] - 0.1) * h,
      Math.max(2, w * 0.02),
      h * 0.2,
    );
  g.fillRect(x + pong.ball.x * w - 1, y + pong.ball.y * h - 1, 3, 3);
  g.font = `${Math.max(7, Math.round(h / 5))}px monospace`;
  g.textAlign = "center";
  g.fillText(`${pong.score[0]}   ${pong.score[1]}`, x + w / 2, y + h * 0.25);
}
