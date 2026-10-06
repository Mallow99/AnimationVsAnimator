import type { Pet } from "../core/pet";
import { OverlayTools } from "../core/overlay-tools";
import { satchelAt } from "../core/satchel";
import { thingCard } from "../settings/item-card";

type Position = { x: number; y: number };
function icon(bin: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 18;
  const g = c.getContext("2d")!;
  g.fillStyle = bin ? "#515b55" : "#594632";
  g.fillRect(4, 5, 11, 12);
  g.fillStyle = bin ? "#acb7ad" : "#a58a61";
  g.fillRect(5, 6, 9, 10);
  g.fillStyle = bin ? "#515b55" : "#594632";
  if (bin) {
    g.fillRect(3, 4, 13, 2);
    g.fillRect(7, 2, 5, 2);
    g.fillRect(7, 8, 1, 6);
    g.fillRect(11, 8, 1, 6);
  } else {
    g.fillRect(6, 2, 7, 1);
    g.fillRect(5, 3, 1, 3);
    g.fillRect(13, 3, 1, 3);
    g.fillRect(5, 8, 9, 1);
    g.fillStyle = "#dbc89c";
    g.fillRect(9, 8, 2, 3);
  }
  return c;
}

/** Wearable inventory, with optional movable world shortcuts. Pointer use never takes keyboard focus. */
export class ToolBag {
  readonly tools: OverlayTools;
  private root = document.createElement("div");
  private panel = document.createElement("section");
  private bag = document.createElement("button");
  private bin = document.createElement("button");
  private undo = document.createElement("button");
  private title = document.createElement("strong");
  private status = document.createElement("p");
  private choices = document.createElement("div");
  private owners = document.createElement("div");
  private signature = "";
  private selected = "";
  private owned = false;
  private opened = false;
  private keyboard = false;
  private pointerPull = false;
  private pullOrigin = { x: 0, y: 0 };
  private positions = {
    bag: { x: innerWidth - 100, y: 100 },
    bin: { x: innerWidth - 52, y: 100 },
  };
  private moving: {
    kind: "bag" | "bin";
    start: Position;
    from: Position;
    moved: boolean;
  } | null = null;
  private suppressClick = false;
  constructor(
    private pets: () => Pet[],
    private changed: () => void,
    private typing: (on: boolean) => void,
    private canPull: () => boolean,
  ) {
    this.tools = new OverlayTools(pets);
    try {
      const saved = JSON.parse(
        localStorage.getItem("overlay-tools-placement") ?? "null",
      );
      for (const kind of ["bag", "bin"] as const)
        if (
          Number.isFinite(saved?.[kind]?.x) &&
          Number.isFinite(saved?.[kind]?.y)
        )
          this.positions[kind] = saved[kind];
    } catch {
      /* Invalid placement falls back to the screen edge. */
    }
    this.root.id = "overlayTools";
    this.bag.id = "grabBag";
    this.bag.type = "button";
    this.bag.append(icon(false));
    this.bag.setAttribute("aria-label", "Open supplies");
    this.bag.title = "Supplies · drag to reposition";
    this.bag.setAttribute("aria-controls", "bagPanel");
    this.bag.setAttribute("aria-expanded", "false");
    this.bin.id = "trashCan";
    this.bin.type = "button";
    this.bin.append(icon(true));
    this.bin.setAttribute("aria-label", "Trash held object");
    this.bin.title = "Drop an in-app object here · drag to reposition";
    this.undo.id = "undoTrash";
    this.undo.type = "button";
    this.undo.hidden = true;
    this.undo.textContent = "Undo";
    this.undo.onclick = () => {
      const r = this.bin.getBoundingClientRect();
      if (this.tools.undo({ x: r.left - 70, y: r.top + 65 })) {
        this.changed();
        this.refresh();
      }
    };
    this.bin.onclick = () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (this.tools.trashHeld()) this.trashed();
    };
    this.bag.onclick = () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.owned = false;
      this.toggle();
    };
    for (const kind of ["bag", "bin"] as const)
      this[kind].onmousedown = (e) => {
        if (
          e.button === 0 &&
          !this.dragging &&
          !this.pets().some((p) => p.dragging || p.carrying)
        )
          this.moving = {
            kind,
            start: { x: e.clientX, y: e.clientY },
            from: { ...this.positions[kind] },
            moved: false,
          };
      };
    this.panel.id = "bagPanel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Satchel and supplies");
    const header = document.createElement("header");
    const keys = document.createElement("button");
    keys.id = "bagKeyboard";
    keys.type = "button";
    keys.textContent = "Keyboard";
    keys.title = "Enable keyboard navigation";
    keys.onclick = () => {
      this.keyboard = true;
      this.typing(true);
      this.choices.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Close grab bag");
    close.onclick = () => this.toggle(false);
    header.append(this.title, keys, close);
    this.owners.className = "bag-owners";
    this.status.id = "bagHint";
    this.status.setAttribute("role", "status");
    this.status.textContent =
      "Pull a tool out. Drop it on a figure to store it, or on the desktop to place it.";
    this.choices.className = "bag-choices";
    this.panel.append(header, this.owners, this.status, this.choices);
    this.root.append(this.bag, this.bin, this.undo, this.panel);
    document.body.append(this.root);
    this.root.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.root.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.root.addEventListener("focusout", () =>
      queueMicrotask(() => {
        if (
          !this.root.contains(document.activeElement) &&
          this.keyboard &&
          !this.dragging
        ) {
          this.keyboard = false;
          this.typing(false);
        }
      }),
    );
    window.addEventListener("mousemove", (e) => {
      const m = this.moving;
      if (!m) return;
      if (Math.hypot(e.clientX - m.start.x, e.clientY - m.start.y) > 5)
        m.moved = true;
      if (m.moved) {
        this.positions[m.kind] = {
          x: m.from.x + e.clientX - m.start.x,
          y: m.from.y + e.clientY - m.start.y,
        };
        this.layout();
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.moving?.moved) {
        this.suppressClick = true;
        localStorage.setItem(
          "overlay-tools-placement",
          JSON.stringify(this.positions),
        );
      }
      this.moving = null;
    });
    window.addEventListener("resize", () => this.layout());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (this.opened || this.dragging)) {
        this.toggle(false);
        this.cancel();
        e.preventDefault();
      }
    });
    this.refresh();
  }
  private current() {
    return (
      this.pets().find((p) => p.ctx.who === this.selected) ?? this.pets()[0]
    );
  }
  showFor(p: Pet) {
    this.selected = p.ctx.who;
    this.owned = true;
    this.toggle(true);
  }
  private toggle(on = !this.opened, keepKeyboard = false) {
    this.opened = on;
    this.panel.hidden = !on;
    this.bag.setAttribute("aria-expanded", String(on));
    if (on) {
      this.signature = "";
      this.refresh();
      this.panel.scrollTop = 0;
    } else if (!keepKeyboard) {
      if (this.root.contains(document.activeElement))
        (document.activeElement as HTMLElement)?.blur();
      this.keyboard = false;
      this.typing(false);
    }
  }
  private layout() {
    for (const kind of ["bag", "bin"] as const) {
      const p = this.positions[kind];
      p.x = Math.max(4, Math.min(innerWidth - 40, p.x));
      p.y = Math.max(4, Math.min(innerHeight - 40, p.y));
      this[kind].style.left = `${p.x}px`;
      this[kind].style.top = `${p.y}px`;
    }
    if (
      Math.abs(this.positions.bag.x - this.positions.bin.x) < 40 &&
      Math.abs(this.positions.bag.y - this.positions.bin.y) < 40
    ) {
      this.positions.bag.x = Math.max(4, this.positions.bin.x - 44);
      this.bag.style.left = `${this.positions.bag.x}px`;
      if (this.positions.bin.x < 48) {
        this.positions.bag.y = Math.min(
          innerHeight - 40,
          this.positions.bin.y + 44,
        );
        this.bag.style.top = `${this.positions.bag.y}px`;
      }
    }
    this.undo.style.left = `${Math.max(4, this.positions.bin.x - 60)}px`;
    this.undo.style.top = `${this.positions.bin.y + 6}px`;
    const at =
      this.owned && this.current()
        ? satchelAt(this.current()!.char)
        : this.positions.bag;
    this.panel.style.left = `${Math.max(8, Math.min(innerWidth - this.panel.offsetWidth - 8, at.x - this.panel.offsetWidth))}px`;
    this.panel.style.top = `${Math.max(8, Math.min(innerHeight - this.panel.offsetHeight - 8, at.y))}px`;
  }
  over(x: number, y: number) {
    return (
      !!this.moving ||
      [this.bag, this.bin, this.undo, this.panel].some((el) => {
        if (el.hidden) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      })
    );
  }
  overTrash(x: number, y: number) {
    if (this.bin.hidden) return false;
    const r = this.bin.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  get dragging() {
    return this.tools.dragging;
  }
  get isOpen() {
    return this.opened;
  }
  refresh() {
    const pets = this.pets(),
      owner = this.current();
    this.bag.hidden = !pets[0]?.config.showBag;
    this.bin.hidden = !pets[0]?.config.showTrash;
    this.undo.hidden = this.bin.hidden || !this.tools.trashedName;
    this.undo.setAttribute(
      "aria-label",
      `Retrieve ${this.tools.trashedName ?? "last object"} from trash`,
    );
    this.bin.classList.toggle("receiving", this.dragging);
    const signature = JSON.stringify([
      this.owned,
      owner?.ctx.who,
      pets.map((p) => [p.ctx.who, p.config.name]),
      this.owned
        ? owner?.items.onHim.map((i) => [i.uid, i.where])
        : [
            owner && [...owner.items.defs.values()],
            owner && [...owner.props.defs.values()],
          ],
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.title.textContent = this.owned
        ? `${owner?.config.name ?? "Figure"}’s satchel`
        : "Supplies";
      this.owners.replaceChildren(
        ...pets.map((p) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = p.config.name;
          b.setAttribute("aria-pressed", String(p === owner));
          b.onclick = () => {
            this.selected = p.ctx.who;
            this.refresh();
          };
          return b;
        }),
      );
      this.renderChoices();
    }
    this.layout();
  }
  private renderChoices() {
    const owner = this.current();
    this.choices.replaceChildren();
    if (!owner) return;
    const choice = (
      kind: "item" | "prop" | "owned",
      id: string,
      def: Parameters<typeof thingCard>[0],
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bag-choice";
      button.dataset.kind = kind;
      button.dataset.id = id;
      button.setAttribute("aria-label", `Pull out ${def.name}`);
      button.append(thingCard(def, [], 18));
      button.onmousedown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.startPull(kind, id, e.clientX, e.clientY, true);
      };
      button.onclick = (e) => {
        if (e.detail === 0) {
          const at = satchelAt(owner.char);
          this.startPull(kind, id, at.x, at.y, false);
        }
      };
      button.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.repeat) button.click();
        }
      };
      this.choices.append(button);
    };
    if (this.owned) {
      for (const item of owner.items.onHim)
        choice("owned", String(item.uid), item.def);
      const supplies = document.createElement("button");
      supplies.type = "button";
      supplies.className = "bag-choice";
      supplies.textContent = "Tools & furniture supplies";
      supplies.onclick = () => {
        this.owned = false;
        this.refresh();
      };
      this.choices.append(supplies);
    } else
      for (const [kind, defs] of [
        ["item", owner.items.defs],
        ["prop", owner.props.defs],
      ] as const) {
        const heading = document.createElement("h3");
        heading.textContent = kind === "item" ? "Tools" : "Furniture";
        this.choices.append(heading);
        for (const def of defs.values()) choice(kind, def.id, def);
      }
  }
  private startPull(
    kind: "item" | "prop" | "owned",
    id: string,
    x: number,
    y: number,
    pointer: boolean,
  ) {
    const owner = this.current();
    const item =
      kind === "owned"
        ? owner?.items.onHim.find((i) => String(i.uid) === id)
        : null;
    if (
      !owner ||
      !this.canPull() ||
      !(kind === "owned"
        ? item && this.tools.beginItem(owner, item, { x, y })
        : this.tools.pull(owner, kind, id, { x, y }))
    ) {
      this.status.textContent =
        "Put away the tool you are already holding first.";
      return;
    }
    this.pointerPull = pointer;
    this.pullOrigin = { x, y };
    this.toggle(false, !pointer && this.keyboard);
    this.refresh();
  }
  move(x: number, y: number, vx: number, vy: number) {
    this.tools.move({ x, y }, { x: vx, y: vy });
  }
  release(x: number, y: number, vx: number, vy: number) {
    if (!this.dragging) return false;
    if (
      this.pointerPull &&
      Math.hypot(x - this.pullOrigin.x, y - this.pullOrigin.y) < 6
    ) {
      this.pointerPull = false;
      return true;
    }
    const recipient =
      [...this.pets()]
        .reverse()
        .find((p) => p.char.hitTest(x, y, 12) || p.satchelHit(x, y)) ?? null;
    if (this.overTrash(x, y)) this.tools.trashHeld();
    else this.tools.release({ x, y }, { x: vx, y: vy }, recipient);
    this.pointerPull = false;
    this.keyboard = false;
    this.typing(false);
    this.changed();
    this.refresh();
    return true;
  }
  cancel() {
    const entry = this.tools.held;
    if (!entry) return;
    const b = entry.owner.ctx.world.bounds;
    this.tools.release(
      {
        x: Math.min(b.right - 40, Math.max(40, entry.owner.char.x + 70)),
        y: b.floor - 120,
      },
      { x: 0, y: 0 },
    );
    this.keyboard = false;
    this.typing(false);
    this.changed();
    this.refresh();
  }
  trashed() {
    this.changed();
    this.refresh();
  }
}
