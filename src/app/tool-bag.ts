import type { Pet } from '../core/pet';
import { OverlayTools } from '../core/overlay-tools';
import { thingCard } from '../settings/item-card';

const BAG_ART = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 19c-3-14 29-14 26 0" fill="none" stroke="#554d42" stroke-width="4"/><path d="M11 20h42l3 35H8z" fill="#b5a285" stroke="#554d42" stroke-width="3"/><path d="M10 21h44v13H10z" fill="#d3c2a7"/><path d="M29 28h7v14h-7z" fill="#554d42"/><path d="M17 47h30" stroke="#89775e" stroke-width="3"/></svg>';
const BIN_ART = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 21h38l-4 35H17z" fill="#b5bab8" stroke="#505a57" stroke-width="3"/><path d="M10 17h44M25 12h14M26 29v18m12-18v18" stroke="#505a57" stroke-width="4" fill="none"/></svg>';

/** Small world tools; the illustrated catalog exists only while the bag is open. */
export class ToolBag {
  readonly tools: OverlayTools;
  private root = document.createElement('div');
  private panel = document.createElement('section');
  private bag = document.createElement('button');
  private bin = document.createElement('button');
  private undo = document.createElement('button');
  private status = document.createElement('p');
  private choices = document.createElement('div');
  private ownerSelect = document.createElement('select');
  private signature = '';
  private opened = false;
  private pointerPull = false;
  private pullOrigin = { x: 0, y: 0 };
  constructor(private pets: () => Pet[], private changed: () => void, private typing: (on: boolean) => void, private canPull: () => boolean) {
    this.tools = new OverlayTools(pets);
    this.root.id = 'overlayTools';
    this.bag.id = 'grabBag'; this.bag.type = 'button'; this.bag.innerHTML = BAG_ART;
    this.bag.setAttribute('aria-label', 'Open grab bag'); this.bag.title = 'Grab bag · tools and furniture';
    this.bag.setAttribute('aria-controls', 'bagPanel'); this.bag.setAttribute('aria-expanded', 'false');
    this.bin.id = 'trashCan'; this.bin.type = 'button'; this.bin.innerHTML = BIN_ART;
    this.bin.setAttribute('aria-label', 'Trash held object'); this.bin.title = 'Drop an in-app object here · undo beside the can';
    this.undo.id = 'undoTrash'; this.undo.type = 'button'; this.undo.hidden = true;
    this.undo.textContent = 'Undo'; this.undo.onclick = () => {
      const r = this.bin.getBoundingClientRect();
      if (this.tools.undo({ x: r.left - 70, y: r.top - 110 })) { this.changed(); this.refresh(); }
    };
    this.bin.onclick = () => { if (this.tools.trashHeld()) { this.changed(); this.refresh(); } };
    this.bag.onclick = () => this.toggle();
    this.panel.id = 'bagPanel'; this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Grab bag');
    const header = document.createElement('header');
    const title = document.createElement('strong'); title.textContent = 'Grab bag';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', 'Close grab bag'); close.onclick = () => this.toggle(false);
    header.append(title, close);
    const label = document.createElement('label'); label.textContent = 'For '; this.ownerSelect.setAttribute('aria-label', 'Bag item owner'); label.append(this.ownerSelect);
    this.status.id = 'bagHint'; this.status.setAttribute('role', 'status');
    this.status.textContent = 'Drag a tool out, then drop it on a figure or the desktop. Click to place with your next click.';
    this.choices.className = 'bag-choices';
    this.panel.append(header, label, this.status, this.choices);
    this.root.append(this.bag, this.bin, this.undo, this.panel); document.body.append(this.root);
    this.root.addEventListener('mousedown', e => e.stopPropagation());
    this.root.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
    this.root.addEventListener('focusin', () => this.typing(true));
    this.root.addEventListener('focusout', () => queueMicrotask(() => this.typing(this.opened || this.dragging || this.root.contains(document.activeElement))));
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && (this.opened || this.tools.dragging || this.root.contains(document.activeElement))) { this.toggle(false); this.cancel(); e.preventDefault(); }
    });
    this.refresh();
  }

  private toggle(on = !this.opened) {
    this.opened = on; this.panel.hidden = !on;
    this.bag.setAttribute('aria-expanded', String(on));
    this.bag.setAttribute('aria-label', on ? 'Close grab bag' : 'Open grab bag');
    this.typing(on || this.dragging);
    if (on) { this.refresh(); this.ownerSelect.focus(); } else (document.activeElement as HTMLElement | null)?.blur();
  }
  over(x: number, y: number) {
    return [this.bag, this.bin, this.undo, this.panel].some(el => {
      if (el.hidden) return false;
      const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }
  overTrash(x: number, y: number) { const r = this.bin.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  get dragging() { return this.tools.dragging; }
  get isOpen() { return this.opened; }
  refresh() {
    const pets = this.pets();
    const signature = JSON.stringify(pets.map(p => [p.ctx.who, p.config.name, [...p.items.defs.values()], [...p.props.defs.values()]]));
    if (signature !== this.signature) {
      this.signature = signature;
      const selected = this.ownerSelect.value;
      this.ownerSelect.replaceChildren(...pets.map(p => { const o = document.createElement('option'); o.value = p.ctx.who; o.textContent = p.config.name; return o; }));
      if (pets.some(p => p.ctx.who === selected)) this.ownerSelect.value = selected;
      this.renderChoices();
    }
    this.undo.hidden = !this.tools.trashedName;
    this.undo.setAttribute('aria-label', `Retrieve ${this.tools.trashedName ?? 'last object'} from trash`);
    this.bin.classList.toggle('receiving', this.dragging);
  }
  private renderChoices() {
    const owner = this.pets()[0];
    this.choices.replaceChildren();
    if (!owner) return;
    for (const [kind, defs] of [['item', owner.items.defs], ['prop', owner.props.defs]] as const) {
      const heading = document.createElement('h3'); heading.textContent = kind === 'item' ? 'Tools' : 'Furniture'; this.choices.append(heading);
      for (const def of defs.values()) {
        const card = thingCard(def, []);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'bag-choice'; button.dataset.kind = kind; button.dataset.id = def.id;
        button.setAttribute('aria-label', `Pull out ${def.name}`); button.append(card);
        button.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.stopPropagation();
          this.startPull(kind, def.id, e.clientX, e.clientY, true);
        });
        button.addEventListener('click', e => {
          // Keyboard activation has no preceding mouse press.
          if (e.detail === 0) {
            const r = this.bag.getBoundingClientRect(); this.startPull(kind, def.id, r.right + 45, r.top - 80, false);
          }
        });
        button.addEventListener('keydown', e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (!e.repeat) button.click();
        });
        this.choices.append(button);
      }
    }
  }
  private startPull(kind: 'item' | 'prop', id: string, x: number, y: number, pointer: boolean) {
    const owner = this.pets().find(p => p.ctx.who === this.ownerSelect.value) ?? this.pets()[0];
    if (!owner || !this.canPull() || !this.tools.pull(owner, kind, id, { x, y })) { this.status.textContent = 'Put away the tool you are already holding first.'; return; }
    this.pointerPull = pointer; this.pullOrigin = { x, y };
    this.toggle(false); this.refresh();
  }
  move(x: number, y: number, vx: number, vy: number) { this.tools.move({ x, y }, { x: vx, y: vy }); }
  release(x: number, y: number, vx: number, vy: number) {
    if (!this.dragging) return false;
    // A short click selects an object; the next click places it. Dragging releases immediately.
    if (this.pointerPull && Math.hypot(x - this.pullOrigin.x, y - this.pullOrigin.y) < 6) { this.pointerPull = false; return true; }
    const recipient = [...this.pets()].reverse().find(p => p.char.hitTest(x, y, 12)) ?? null;
    if (this.overTrash(x, y)) this.tools.trashHeld(); else this.tools.release({ x, y }, { x: vx, y: vy }, recipient);
    this.pointerPull = false; this.changed(); this.refresh(); this.typing(this.opened); return true;
  }
  cancel() {
    const entry = this.tools.held;
    if (!entry) return;
    const b = entry.owner.ctx.world.bounds;
    this.tools.release({ x: Math.min(b.right - 40, Math.max(40, entry.owner.char.x + 70)), y: b.floor - 120 }, { x: 0, y: 0 });
    this.changed(); this.refresh(); this.typing(this.opened);
  }
  trashed() { this.changed(); this.refresh(); }
}
