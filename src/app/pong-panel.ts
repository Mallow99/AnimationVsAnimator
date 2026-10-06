import type { Pet } from "../core/pet";
import { paintPong } from "../core/pong";

export function createPongPanel(
  pets: () => Pet[],
  typing: (on: boolean) => void,
) {
  const root = document.createElement("section");
  root.id = "pongPanel";
  root.hidden = true;
  const title = document.createElement("strong"),
    court = document.createElement("canvas");
  court.width = 160;
  court.height = 100;
  const join = document.createElement("button"),
    rematch = document.createElement("button"),
    leave = document.createElement("button"),
    keys = document.createElement("button");
  join.textContent = "Join";
  rematch.textContent = "Rematch";
  leave.textContent = "Leave";
  keys.textContent = "Keyboard";
  for (const b of [join, rematch, leave, keys]) b.type = "button";
  const controls = document.createElement("div");
  controls.append(join, rematch, keys, leave);
  root.append(title, court, controls);
  document.body.append(root);
  let keyboard = false;
  const tv = () => pets()[0]?.props.things.find((t) => t.pong);
  join.onclick = () => {
    const p = tv()?.pong;
    if (p) p.user = 0;
  };
  rematch.onclick = () => tv()?.pong?.rematch();
  leave.onclick = () => {
    const p = tv()?.pong;
    if (p) p.user = null;
    keyboard = false;
    typing(false);
  };
  keys.onclick = () => {
    if (!tv()?.pong) return;
    tv()!.pong!.user = 0;
    keyboard = true;
    typing(true);
    court.hidden = false;
    court.tabIndex = 0;
    court.focus();
  };
  root.onmousedown = (e) => {
    e.stopPropagation();
    if (!keyboard) e.preventDefault();
  };
  court.onmousemove = (e) => {
    const p = tv()?.pong;
    if (!p || p.user === null) return;
    const r = court.getBoundingClientRect();
    p.moveUser((e.clientY - r.top) / r.height);
  };
  root.onkeydown = (e) => {
    const p = tv()?.pong;
    if (!p) return;
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      p.moveUser(p.paddles[p.user ?? 0] + (e.key === "ArrowUp" ? -0.06 : 0.06));
    }
    if (e.key === "Escape") {
      p.user = null;
      keyboard = false;
      court.blur();
      typing(false);
    }
  };
  return {
    over(x: number, y: number) {
      if (root.hidden) return false;
      const r = root.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
    update() {
      const t = tv(),
        p = t?.pong;
      root.hidden = !p;
      if (!p) {
        if (keyboard) {
          keyboard = false;
          typing(false);
        }
        return;
      }
      const names = p.players.map(
        (id) => pets().find((q) => q.ctx.who === id)?.config.name ?? id,
      );
      title.textContent =
        p.winner === null
          ? `${names[0]} · ${p.score[0]} : ${p.score[1]} · ${names[1]}`
          : `${p.winner === 0 ? names[0] : names[1]} wins`;
      join.hidden = p.user !== null;
      leave.hidden = p.user === null;
      rematch.hidden = p.winner === null;
      paintPong(court.getContext("2d")!, p, 0, 0, court.width, court.height);
      const b = t!.center;
      root.style.left = `${Math.max(8, Math.min(innerWidth - root.offsetWidth - 8, b.x - 80))}px`;
      root.style.top = `${Math.max(8, Math.min(innerHeight - root.offsetHeight - 8, b.y - 230))}px`;
      // The full court is available on demand; otherwise it is an intermittent preview.
      court.hidden = p.user === null && p.time % 25 > 4 && p.winner === null;
    },
  };
}
