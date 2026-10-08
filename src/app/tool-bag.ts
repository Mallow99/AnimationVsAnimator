import type { Pet } from "../core/pet";
import { OverlayTools } from "../core/overlay-tools";
import { satchelAt } from "../core/satchel";
import { thingCard } from "../settings/item-card";
import { isWeapon } from "../core/combat/armament";
import type { Item } from "../core/items";
import type { Thing } from "../core/props";
import { activitiesFor } from "./activities";

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
  private owners = document.createElement("select");
  private search = document.createElement("input");
  private tabs = document.createElement("nav");
  private details = document.createElement("div");
  private footer = document.createElement("footer");
  private panelUndo = document.createElement("button");
  private transport = document.createElement("div");
  private transportHint = document.createElement("span");
  private transportUse = document.createElement("button");
  private help = document.createElement("details");
  private hint = document.createElement("div");
  private hoverOwner: Pet | null = null;
  private hoverAt = 0;
  private view: "inventory" | "supplies" | "activities" = "inventory";
  private selection: { kind: "item" | "prop" | "owned"; id: string } | null = null;
  private pendingPull: { kind: "item" | "prop" | "owned"; id: string; x: number; y: number } | null = null;
  private anchor: Position = { x: 0, y: 0 };
  private signature = "";
  private selected = "";
  private get owned() { return this.view === "inventory"; }
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
      this.selected = "all";
      this.setView("supplies");
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
    this.panel.setAttribute("aria-label", "Figure bag, supplies and activities");
    const header = document.createElement("header");
    const keys = document.createElement("button");
    keys.id = "bagKeyboard";
    keys.type = "button";
    keys.textContent = "Keyboard";
    keys.title = "Enable keyboard navigation";
    keys.onclick = () => {
      this.keyboard = true;
      this.typing(true);
      this.choices.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    };
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Close bag");
    close.onclick = () => this.toggle(false);
    header.append(this.title, keys, close);
    this.tabs.className = "bag-tabs";
    this.tabs.setAttribute("aria-label", "Bag sections");
    for (const [view, label, id] of [["inventory", "Bag", "bagInventory"], ["supplies", "Supplies", "bagSupplies"], ["activities", "Activities", "bagActivities"]] as const) {
      const tab = document.createElement("button");
      tab.type = "button"; tab.id = id; tab.textContent = label; tab.dataset.view = view;
      tab.onclick = () => this.setView(view);
      this.tabs.append(tab);
    }
    this.owners.className = "bag-owners";
    this.owners.id = "bagOwner"; this.owners.setAttribute("aria-label", "Inventory target");
    this.owners.onchange = () => { this.selected = this.owners.value; this.selection = null; this.signature = ""; this.refresh(); };
    this.search.id = "bagSearch"; this.search.type = "search"; this.search.placeholder = "Find an item or activity";
    this.search.setAttribute("aria-label", "Find an item or activity");
    this.search.oninput = () => this.renderChoices();
    for(const input of [this.search,this.owners]) input.onfocus = () => { this.keyboard=true; this.typing(true); };
    this.status.id = "bagHint";
    this.status.setAttribute("role", "status");
    this.choices.className = "bag-choices";
    this.details.id = "bagDetails";
    this.panelUndo.id = "bagUndo"; this.panelUndo.type = "button";
    this.panelUndo.onclick = () => this.restoreTrash();
    const summary = document.createElement("summary"); summary.textContent = "How to use this";
    const instructions = document.createElement("p");
    instructions.textContent = "Right-click a figure → Open bag. Bag contains its own items; Supplies adds new tools or furniture. Click a card to see its actions, or drag it onto the desktop or another figure. Activities lists things the figure can do and what each needs. Escape or Cancel puts a dragged item back. Trash has one Undo, also available here when the desktop shortcuts are hidden.";
    this.help.append(summary, instructions);
    this.footer.append(this.panelUndo, this.help);
    this.panel.append(header, this.owners, this.tabs, this.search, this.status, this.details, this.choices, this.footer);
    this.transport.id = "bagTransport"; this.transport.hidden = true;
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.onclick = () => this.cancel();
    this.transportUse.type = "button"; this.transportUse.textContent = "Use with cursor";
    this.transportUse.onclick = () => {
      const held = this.tools.held;
      if (held?.kind !== "item") return;
      if (["wipe", "erase", "color"].includes(held.object.def.use)) {
        this.tools.setUsing(!this.tools.using);
      } else if (isWeapon(held.object.def)) {
        const at = { ...held.object.at };
        this.tools.release(at, { x: 0, y: 0 }, held.owner);
        held.owner.useItem(held.object);
      }
      this.keyboard = false; this.typing(false); this.changed(); this.refresh();
    };
    this.transport.append(this.transportHint, this.transportUse, cancel);
    this.root.append(this.bag, this.bin, this.undo, this.panel, this.transport);
    document.body.append(this.root);
    this.hint.id = "figureHint"; this.hint.hidden = true;
    this.hint.textContent = "Right-click → Open bag / Activities";
    document.body.append(this.hint);
    this.root.addEventListener("mousedown", (e) => {
      if (!this.keyboard && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      e.stopPropagation();
    });
    this.root.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.root.addEventListener("keydown", e => {
      if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ") && e.target instanceof HTMLButtonElement) {
        e.preventDefault();
        if (!e.repeat) e.target.click();
      }
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
      const pull = this.pendingPull;
      if (pull && Math.hypot(e.clientX - pull.x, e.clientY - pull.y) > 6) {
        this.pendingPull = null;
        this.startPull(pull.kind, pull.id, pull.x, pull.y, true);
      }
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
      this.pendingPull = null;
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
  private targets() { return this.selected === "all" ? this.pets() : [this.current()].filter((p):p is Pet=>!!p); }
  private itemOwner(id:string) { return this.targets().find(p=>p.items.list.some(i=>String(i.uid)===id)); }
  showAll(view: "inventory" | "supplies" | "activities" = "inventory") {
    const p=this.pets()[0];if(!p||this.dragging)return;
    this.showFor(p,view);this.selected="all";this.signature="";this.refresh();
  }
  showFor(p: Pet, view: "inventory" | "supplies" | "activities" = "inventory") {
    if (this.dragging) return;
    for (const pet of this.pets()) pet.closeMenu();
    this.selected = p.ctx.who;
    this.view = view; this.selection = null;
    this.anchor = satchelAt(p.char);
    this.toggle(true);
  }
  private setView(view: typeof this.view) {
    this.pendingPull = null;
    this.view = view; this.selection = null; this.signature = "";
    this.status.textContent = "";
    if (!this.opened) this.anchor = { ...this.positions.bag };
    this.refresh();
    this.choices.scrollTop = 0;
  }
  close() { this.toggle(false); }
  hover(p: Pet | null, now: number) {
    if (p !== this.hoverOwner) { this.hoverOwner = p; this.hoverAt = now; }
    this.hint.hidden = !p || now - this.hoverAt < 700 || this.opened || this.dragging || p.menuOpen || p.carrying || p.dragging;
    if (this.hint.hidden || !p) return;
    const at = p.talkAnchor();
    this.hint.style.left = `${Math.max(8, Math.min(innerWidth - this.hint.offsetWidth - 8, at.x - this.hint.offsetWidth / 2))}px`;
    this.hint.style.top = `${Math.max(8, at.y - 38)}px`;
  }
  private toggle(on = !this.opened, keepKeyboard = false) {
    this.pendingPull = null;
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
    const at = this.anchor;
    this.panel.style.left = `${Math.max(8, Math.min(innerWidth - this.panel.offsetWidth - 8, at.x - this.panel.offsetWidth))}px`;
    this.panel.style.top = `${Math.max(8, Math.min(innerHeight - this.panel.offsetHeight - 8, at.y))}px`;
  }
  over(x: number, y: number) {
    return (
      !!this.moving ||
      !!this.pendingPull ||
      [this.bag, this.bin, this.undo, this.panel, this.transport].some((el) => {
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
    if (!owner) { this.toggle(false); return; }
    if (this.dragging && !pets.includes(this.tools.held!.owner)) this.cancel();
    this.bag.hidden = !pets[0]?.config.showBag;
    this.bin.hidden = !pets[0]?.config.showTrash;
    this.undo.hidden = this.bin.hidden || !this.tools.trashedName;
    this.undo.setAttribute(
      "aria-label",
      `Retrieve ${this.tools.trashedName ?? "last object"} from trash`,
    );
    this.bin.classList.toggle("receiving", this.dragging);
    this.transport.hidden = !this.dragging;
    const held = this.tools.held;
    this.transportUse.hidden = held?.kind !== "item" || !(isWeapon(held.object.def) || ["wipe", "erase", "color"].includes(held.object.def.use));
    this.transportUse.textContent = this.tools.using ? "Stop using" : "Use with cursor";
    this.transportHint.textContent = held ? `${held.kind === "item" ? held.object.def.name : held.kind === "thing" ? held.object.def?.name ?? "Object" : "Ball"} · Drop on the desktop${held.kind === "item" ? " or a figure" : ""}.` : "";
    this.panelUndo.hidden = !this.tools.trashedName;
    this.panelUndo.textContent = `Undo trash: ${this.tools.trashedName ?? ""}`;
    for (const tab of this.tabs.querySelectorAll("button")) tab.setAttribute("aria-pressed", String(tab.dataset.view === this.view));
    const actions = this.view === "activities" ? this.targets().map(p=>activitiesFor(p)) : [];
    const signature = JSON.stringify([
      this.view,
      this.selected,
      pets.map((p) => [p.ctx.who, p.config.name]),
      this.owned
        ? this.targets().map(p=>[p.ctx.who,p.items.list.map((i) => [i.uid, i.where, i.ammo, i.shelf, i.bookmark, i.ink?.progress])])
        : [
            owner && [...owner.items.defs.values()],
            owner && [...owner.props.defs.values()],
          ],
      actions,
    ]);
    if (signature !== this.signature) {
      const focused = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement) ? document.activeElement : null;
      this.signature = signature;
      this.title.textContent = "Inventory and activities";
      const all=this.selected==="all", who=all?"all figures":owner.config.name;
      this.status.textContent = this.owned ? `${all?"Owned items for all figures":`${owner.items.onHim.filter(i => i.where === "belt").length}/16 bag slots`} · Items on shelves and the desktop are included.` : this.view === "supplies" ? `New supplies for ${who}. Furniture places one shared object.` : `Activities for ${who}. Shared activities start once; individual activities use available figures.`;
      this.owners.replaceChildren(new Option("All figures on the desktop","all"),...pets.map(p=>new Option(p.config.name,p.ctx.who)));
      this.owners.value=this.selected==="all"?"all":owner.ctx.who;
      this.renderChoices();
      if (this.keyboard && this.opened && focused && !focused.isConnected) {
        const match = [...this.root.querySelectorAll("button")].find(b =>
          focused.id ? b.id === focused.id : focused.dataset.id ? b.dataset.id === focused.dataset.id && b.dataset.kind === focused.dataset.kind : focused.dataset.action ? b.dataset.action === focused.dataset.action : b.textContent === focused.textContent,
        );
        (match ?? this.root.querySelector<HTMLButtonElement>("#bagKeyboard"))?.focus();
      }
    }
    this.layout();
  }
  private renderChoices() {
    const owner = this.current();
    this.choices.replaceChildren();
    if (!owner) return;
    const matches=(text:string)=>text.toLowerCase().includes(this.search.value.trim().toLowerCase());
    const choice = (
      kind: "item" | "prop" | "owned",
      id: string,
      def: Parameters<typeof thingCard>[0],
    ) => {
      if(!matches(def.name+" "+def.about))return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bag-choice";
      button.dataset.kind = kind;
      button.dataset.id = id;
      button.setAttribute("aria-label", `Select ${def.name}`);
      button.setAttribute("aria-pressed", String(this.selection?.kind === kind && this.selection.id === id));
      button.append(thingCard(def, [], 18));
      if (kind === "owned") {
        const actual=this.itemOwner(id)!;
        const item = actual.items.list.find(i => String(i.uid) === id)!;
        const state = document.createElement("small");
        state.textContent = (this.selected==="all"?actual.config.name+" · ":"") + (item.where === "hand" ? "In hand" : item.where === "worn" ? "Wearing" : item.where === "cursor" ? "With cursor" : item.shelf ? "On bookshelf" : item.where === "world" ? "On desktop" : "In bag");
        if(item.bookmark>0)state.textContent += ` · Page ${item.bookmark+1}`;
        if (item.def.use === "gun") state.textContent += ` · ${item.ammo}/6 rounds`;
        button.append(state);
      }
      button.onmousedown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.pendingPull = { kind, id, x: e.clientX, y: e.clientY };
      };
      button.onclick = (e) => {
        if (this.dragging) return;
        this.selection = { kind, id };
        for (const card of this.choices.querySelectorAll(".bag-choice")) card.setAttribute("aria-pressed", String(card === button));
        this.renderDetails(); this.layout();
      };
      button.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.repeat) button.click();
        }
      };
      this.choices.append(button);
    };
    if (this.view === "activities") {
      const choices=this.targets().map(p=>({p,activities:activitiesFor(p)}));
      let group = "";
      for (const activity of activitiesFor(owner)) {
        if(!matches(activity.label+" "+activity.hint+" "+activity.group))continue;
        if (group !== activity.group) { group = activity.group; const h = document.createElement("h3"); h.textContent = group; this.choices.append(h); }
        const button = document.createElement("button"); button.type = "button"; button.className = "bag-activity"; button.dataset.action = activity.command;
        const title = document.createElement("strong"); title.textContent = activity.label;
        const ready=choices.filter(({activities})=>activities.some(a=>a.command===activity.command&&!a.needs));
        const hint = document.createElement("small"); hint.textContent = ready.length ? activity.hint+(ready.length<choices.length?` · ${ready.length}/${choices.length} ready`:"") : activity.needs ?? activity.hint;
        button.disabled = !ready.length; button.append(title, hint);
        button.onclick = () => { const ready=this.targets().filter(p=>activitiesFor(p).some(a=>a.command===activity.command&&!a.needs));const shared=/^(group:|pong|catch|lamp|arrange|carrytogether|readingcorner|workcorner)/.test(activity.command);
          for(const p of shared?ready.slice(0,1):ready)p.command(`do:${activity.command}`);
          this.changed(); this.toggle(false); };
        this.choices.append(button);
      }
      const stop = document.createElement("button"); stop.type = "button"; stop.textContent = owner.mood.asleep ? "Wake up" : "Stop current activity";
      stop.onclick = () => { for(const p of this.targets())p.command("do:wake"); this.changed(); this.signature = ""; this.refresh(); };
      this.choices.prepend(stop);
    } else if (this.owned) {
      for (const p of this.targets())for (const item of p.items.list)
        choice("owned", String(item.uid), item.def);
      if (!this.targets().some(p=>p.items.list.length)) { const empty = document.createElement("p"); empty.className = "bag-empty"; empty.textContent = "This bag is empty. Open Supplies to give this figure a tool."; this.choices.append(empty); }
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
    this.renderDetails();
  }
  private renderDetails() {
    this.details.replaceChildren();
    const selected = this.selection, owner = selected?.kind === "owned" ? this.itemOwner(selected.id) : this.current();
    if (!owner || !selected) { this.details.hidden = true; return; }
    const item = selected.kind === "owned" ? owner.items.list.find(i => String(i.uid) === selected.id) : null;
    const def = selected.kind === "owned" ? item?.def : selected.kind === "item" ? owner.items.defs.get(selected.id) : owner.props.defs.get(selected.id);
    if (!def) { this.selection = null; this.details.hidden = true; return; }
    this.details.hidden = false;
    const name = document.createElement("strong"); name.textContent = def.name;
    const about = document.createElement("p"); about.textContent = def.about;
    const actions = document.createElement("div"); actions.className = "bag-item-actions";
    const action = (label: string, id: string, run: () => void) => { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.action = id; button.onclick = run; actions.append(button); };
    action(selected.kind === "owned" ? "Take out" : "Place on desktop", "place", () => { const at = satchelAt(owner.char); this.startPull(selected.kind, selected.id, at.x, at.y, false); });
    if (item) {
      if (item.def.id === 'book') {
        const shelf = owner.props.placed.find(t=>t.def?.id === 'bookshelf' && !t.held && Math.abs(t.tilt)<0.35);
        if (shelf) action('Store on bookshelf', 'shelve', () => {
          const occupied = this.pets().flatMap(p=>p.items.list).filter(i=>i!==item && i.shelf?.key === shelf.storageKey).map(i=>i.shelf!.slot);
          const slot = [0,1,2,3,4].find(i=>!occupied.includes(i));
          if (slot === undefined) { this.status.textContent = 'The bookshelf is full.'; return; }
          owner.mind.reset(owner.ctx);
          item.at = {...shelf.toWorld(10+slot*15,35),z:6}; item.dir = {x:1,y:0,z:0};
          owner.items.drop(item,0,0); item.shelf = {key:shelf.storageKey,slot};
          this.changed(); this.refresh();
        });
      }
      if (isWeapon(item.def)) action("Use with cursor", "use", () => { if (!this.canPull()) { this.status.textContent = "Return the tool you are using first."; return; } owner.useItem(item); this.toggle(false); this.changed(); });
      if (item.where !== "belt" && !item.def.wear) action("Store in bag", "store", () => { owner.mind.reset(owner.ctx); owner.giveBack(item); this.changed(); this.refresh(); });
      action("Drop beside figure", "drop", () => { owner.mind.reset(owner.ctx); item.at = { x: owner.char.x + 45 * owner.char.scale, y: owner.char.body.j.hip.y, z: 0 }; owner.items.drop(item, 0, 0); this.changed(); this.refresh(); });
      action("Trash", "trash", () => this.trashObject(owner, item));
    } else if (selected.kind === "item") action(`Give to ${this.selected === "all" ? "all figures" : owner.config.name}`, "give", () => {
      const targets=this.targets(), full=targets.filter(p=>p.items.belt.every(Boolean) && !("wear" in def && def.wear));
      for(const p of targets)if(!full.includes(p))p.items.give(def.id,p.char);
      this.changed(); this.setView("inventory");
      if(full.length)this.status.textContent=`These bags are full: ${full.map(p=>p.config.name).join(", ")}. Free a slot or place the supply on the desktop.`;
    });
    this.details.append(name, about, actions);
    if (item && ["wipe", "erase", "color"].includes(item.def.use)) { const hint = document.createElement("small"); hint.textContent = "Take out, choose Use with cursor, then move over the drawing. Stop using lets you carry it safely. Cancel returns it to the bag."; this.details.append(hint); }
  }
  trashObject(owner: Pet, object: Item | Thing) {
    if (this.tools.trashObject(owner, object)) { this.trashed(); this.showFor(owner); }
  }
  private restoreTrash() {
    const owner = this.current(); if (!owner) return;
    if (this.tools.undo({ x: owner.char.x + 70 * owner.char.scale, y: owner.char.body.j.hip.y })) { this.changed(); this.signature = ""; this.refresh(); }
  }
  private startPull(
    kind: "item" | "prop" | "owned",
    id: string,
    x: number,
    y: number,
    pointer: boolean,
  ) {
    const owner = kind === "owned" ? this.itemOwner(id) : this.current();
    const item =
      kind === "owned"
        ? owner?.items.list.find((i) => String(i.uid) === id)
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
    this.toggle(false, this.keyboard);
    this.refresh();
  }
  move(x: number, y: number, vx: number, vy: number) {
    this.tools.move({ x, y }, { x: vx, y: vy }, !this.over(x,y));
  }
  takeItem(owner: Pet, item: Item) {
    this.selected = owner.ctx.who;
    this.startPull("owned", String(item.uid), item.at.x, item.at.y, false);
  }
  storeItem(owner: Pet, item: Item) {
    if (this.tools.held?.object === item) {
      this.tools.release(item.at, { x: 0, y: 0 }, owner);
      this.keyboard = false; this.typing(false);
    } else owner.giveBack(item);
    this.changed(); this.refresh();
  }
  release(x: number, y: number, vx: number, vy: number) {
    if (!this.dragging) return false;
    const controls = this.transport.getBoundingClientRect();
    // A toolbar click belongs to Cancel/Use, not to the desktop drop handler.
    if (!this.transport.hidden && x >= controls.left && x <= controls.right && y >= controls.top && y <= controls.bottom) return true;
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
    this.pendingPull = null;
    if (!this.tools.cancel()) return;
    this.keyboard = false;
    this.typing(false);
    this.changed();
    this.refresh();
  }
  trashed() {
    if (!this.opened && !this.dragging) { this.keyboard = false; this.typing(false); }
    this.changed();
    this.refresh();
  }
}
