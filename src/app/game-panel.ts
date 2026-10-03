// An independent tabletop window. Its position and keyboard focus do not own his speech bubble.
import type { Pet } from '../core/pet';

export function createGamePanel(pet: Pet, typing: (on: boolean) => void, talk: () => void) {
  const panel = document.createElement('section');
  panel.id = 'gamePanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Othello table');
  const header = document.createElement('div'); header.className = 'game-titlebar';
  const title = document.createElement('strong'); title.textContent = 'OTHELLO';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'game-close';
  close.textContent = '×'; close.setAttribute('aria-label', 'Close Othello');
  header.append(title, close);
  const subtitle = document.createElement('p'); subtitle.className = 'game-subtitle';
  const status = document.createElement('p'); status.className = 'game-status'; status.setAttribute('role', 'status');
  const score = document.createElement('div'); score.className = 'game-score';
  const yours = document.createElement('span'), his = document.createElement('span'); score.append(yours, his);
  const grid = document.createElement('div'); grid.className = 'game-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Othello board, eight rows and eight columns');
  let focusIndex = 19;
  const cells = Array.from({ length: 64 }, (_, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
    button.addEventListener('click', () => {
      typing(true);
      focusIndex = i;
      if (pet.game.play(i, pet.ctx.world.time)) updateBoard();
    });
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) button.click();
        return;
      }
      const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!dx && !dy && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const row = Math.floor(i / 8), col = i % 8;
      focusIndex = e.key === 'Home' ? row * 8 : e.key === 'End' ? row * 8 + 7 : Math.max(0, Math.min(7, row + dy)) * 8 + Math.max(0, Math.min(7, col + dx));
      cells.forEach((b, n) => b.tabIndex = n === focusIndex ? 0 : -1);
      cells[focusIndex].focus();
    });
    grid.append(button); return button;
  });
  const rules = document.createElement('details'); rules.className = 'game-rules';
  const summary = document.createElement('summary'); summary.textContent = 'How to play';
  const help = document.createElement('p');
  help.textContent = 'You play black and go first. Place a disc on a marked square to trap his white discs between yours. All trapped rows flip to your color. A turn passes automatically when there is no legal move. Most discs wins when neither side can move. Arrow keys move around the board; Enter places a disc.';
  rules.append(summary, help);
  const actions = document.createElement('div'); actions.className = 'game-actions';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'game-play';
  const chat = document.createElement('button'); chat.type = 'button'; chat.textContent = 'Talk to him'; chat.addEventListener('click', talk);
  play.addEventListener('click', () => {
    // The desktop overlay starts non-focusable. Enable it before asking a cell for focus.
    typing(true);
    pet.game.accept(); updateBoard(); focusIndex = pet.game.moves[0] ?? 19;
    cells.forEach((b, n) => b.tabIndex = n === focusIndex ? 0 : -1);
    setTimeout(() => { if (pet.game.state === 'playing' && !panel.hidden) cells[focusIndex].focus(); }, 30);
  });
  close.addEventListener('click', () => pet.game.close());
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); pet.game.close(); } });
  panel.addEventListener('focusin', () => typing(true));
  panel.addEventListener('pointerdown', () => typing(true));
  panel.addEventListener('focusout', (e) => { if (!panel.contains(e.relatedTarget as Node | null)) typing(false); });
  actions.append(play, chat); panel.append(header, subtitle, score, status, grid, rules, actions); document.body.append(panel);
  let shown = '', wasOpen = false;
  let userPosition = false, measuredSize = '';
  let position = { x: 0, y: 0 }, drag: { id: number; dx: number; dy: number } | null = null;
  const clampPosition = () => {
    position.x = Math.max(8, Math.min(position.x, window.innerWidth - panel.offsetWidth - 8));
    position.y = Math.max(8, Math.min(position.y, window.innerHeight - panel.offsetHeight - 8));
    panel.style.left = `${position.x}px`; panel.style.top = `${position.y}px`;
  };
  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault(); drag = { id: e.pointerId, dx: e.clientX - position.x, dy: e.clientY - position.y };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    userPosition = true;
    position = { x: e.clientX - drag.dx, y: e.clientY - drag.dy }; clampPosition();
  });
  const endDrag = () => { drag = null; };
  header.addEventListener('pointerup', endDrag); header.addEventListener('pointercancel', endDrag); header.addEventListener('lostpointercapture', endDrag);
  rules.addEventListener('toggle', clampPosition);
  function updateBoard() {
    const game = pet.game, count = game.score, moves = game.turn === 'you' ? game.moves : [];
    subtitle.textContent = `A match with ${pet.config.name}`;
    yours.textContent = `● You  ${count.you}`; his.textContent = `○ ${pet.config.name}  ${count.him}`;
    status.textContent = game.state === 'invite' ? 'Pull up a seat. You play black.'
      : game.state === 'finished' ? game.result === 'you' ? 'You won. Nicely played!' : game.result === 'him' ? 'He wins this round.' : 'An even match. A draw!'
        : `${game.notice ? game.notice + ' ' : ''}${game.turn === 'you' ? 'Your turn — choose a marked square.' : 'His turn…'}`;
    grid.hidden = game.state === 'invite'; score.hidden = game.state === 'invite';
    play.hidden = game.state === 'playing'; play.textContent = game.state === 'invite' ? 'Play Othello' : 'Play again';
    cells.forEach((button, i) => {
      const legal = game.state === 'playing' && moves.includes(i);
      button.dataset.disc = game.board[i]; button.dataset.legal = String(legal);
      button.dataset.last = String(i === game.lastMove);
      button.tabIndex = i === focusIndex ? 0 : -1;
      button.setAttribute('aria-disabled', String(!legal));
      button.setAttribute('aria-label', `${String.fromCharCode(65 + i % 8)}${Math.floor(i / 8) + 1}: ${game.board[i] || (legal ? 'legal move' : 'empty')}${i === game.lastMove ? ', last move' : ''}`);
      button.title = button.getAttribute('aria-label')!;
    });
  }
  return {
    get dragging() { return !!drag; },
    over(x: number, y: number) {
      if (panel.hidden) return false;
      const r = panel.getBoundingClientRect(); return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
    },
    rect() { return panel.hidden ? null : panel.getBoundingClientRect(); },
    update() {
      const game = pet.game;
      panel.hidden = game.state === 'closed';
      if (panel.hidden) {
        if (wasOpen) { if (panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); typing(false); }
        wasOpen = false; drag = null; return;
      }
      const key = [game.revision, game.turn, game.state, game.notice, pet.config.name].join('|');
      if (key !== shown) { shown = key; updateBoard(); }
      const size = `${panel.offsetWidth}:${panel.offsetHeight}`;
      if (!wasOpen) userPosition = false;
      if (!wasOpen || !userPosition && size !== measuredSize) {
        const anchor = game.anchor ?? pet.talkAnchor();
        const right = anchor.x + 70, left = anchor.x - panel.offsetWidth - 70;
        const preferLeft = pet.char.x > anchor.x;
        const fitsRight = right + panel.offsetWidth <= window.innerWidth - 8, fitsLeft = left >= 8;
        const x = preferLeft && fitsLeft || !fitsRight && fitsLeft ? left : right;
        position = { x, y: anchor.y - panel.offsetHeight - 60 };
      }
      measuredSize = size; wasOpen = true; clampPosition();
    },
  };
}
