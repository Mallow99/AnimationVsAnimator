// The small board above him. Keep desktop focus/click-through decisions in renderer.ts.
import type { Pet } from '../core/pet';

export function createGamePanel(pet: Pet, typing: (on: boolean) => void) {
  const panel = document.createElement('section');
  panel.id = 'gamePanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Board game');
  const title = document.createElement('strong');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const grid = document.createElement('div'); grid.className = 'game-grid'; grid.setAttribute('aria-label', 'Tic-tac-toe board');
  const cells = Array.from({ length: 9 }, (_, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', () => pet.game.play(i, pet.ctx.world.time));
    grid.append(button); return button;
  });
  const actions = document.createElement('div'); actions.className = 'game-actions';
  const play = document.createElement('button'); play.type = 'button';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  let ownsFocus = false;
  play.addEventListener('click', () => {
    pet.game.accept(); typing(true); ownsFocus = true;
    setTimeout(() => cells[0].focus(), 30);
  });
  close.addEventListener('click', () => pet.game.close());
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); pet.game.close(); } });
  actions.append(play, close); panel.append(title, status, grid, actions); document.body.append(panel);
  let shown = '';
  return {
    over(x: number, y: number) {
      if (panel.hidden) return false;
      const r = panel.getBoundingClientRect(); return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
    },
    update() {
      const game = pet.game;
      panel.hidden = game.state === 'closed';
      if (panel.hidden) { if (ownsFocus) { typing(false); ownsFocus = false; } return; }
      title.textContent = `A game with ${pet.config.name}`;
      panel.style.setProperty('--ink', pet.config.look.color);
      const key = [game.state, game.turn, game.result, ...game.board].join('|');
      if (key !== shown) {
        shown = key;
        status.textContent = game.state === 'invite' ? 'Wanna play? You are X. He is O.'
          : game.state === 'finished' ? game.result === 'X' ? 'You won!' : game.result === 'O' ? 'He won this round.' : 'A draw!'
            : game.turn === 'you' ? 'Your turn — pick a square.' : 'His turn…';
        grid.hidden = game.state === 'invite';
        play.hidden = game.state === 'playing'; play.textContent = game.state === 'invite' ? 'Play' : 'Rematch';
        close.textContent = game.state === 'invite' ? 'Later' : 'Close';
        cells.forEach((button, i) => {
          button.textContent = game.board[i] || '·';
          button.disabled = game.state !== 'playing' || game.turn !== 'you' || !!game.board[i];
          button.setAttribute('aria-label', `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${game.board[i] || 'empty'}`);
        });
      }
      const a = pet.talkAnchor();
      const width = panel.offsetWidth, height = panel.offsetHeight;
      panel.style.left = `${Math.max(8, Math.min(a.x - width / 2, window.innerWidth - width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(a.y - height - 25, window.innerHeight - height - 8))}px`;
    },
  };
}
