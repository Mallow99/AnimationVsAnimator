// One local game with the existing pet. No AI requests or second-character systems.
export type Mark = '' | 'X' | 'O';
export type Result = '' | 'X' | 'O' | 'draw';
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function gameResult(board: readonly Mark[]): Result {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a] as 'X' | 'O';
  return board.every(Boolean) ? 'draw' : '';
}
export function chooseGameMove(board: readonly Mark[], random = Math.random): number {
  const empty = board.flatMap((v, i) => v ? [] : [i]);
  if (!empty.length || gameResult(board)) return -1;
  // Win, then block. Otherwise he picks a square; he is beatable and needs no model.
  for (const mark of ['O', 'X'] as const) for (const i of empty) {
    const trial = [...board]; trial[i] = mark;
    if (gameResult(trial) === mark) return i;
  }
  return empty[Math.min(empty.length - 1, Math.max(0, Math.floor(random() * empty.length)))];
}

export class BoardGame {
  state: 'closed' | 'invite' | 'playing' | 'finished' = 'closed';
  board: Mark[] = Array<Mark>(9).fill('');
  turn: 'you' | 'him' = 'you';
  result: Result = '';
  private nextMove = 0;
  invite() { if (this.state !== 'closed') return false; this.state = 'invite'; return true; }
  accept() { if (this.state !== 'invite' && this.state !== 'finished') return; this.board.fill(''); this.result = ''; this.turn = 'you'; this.state = 'playing'; }
  close() { this.state = 'closed'; }
  play(index: number, now: number) {
    if (this.state !== 'playing' || this.turn !== 'you' || !Number.isInteger(index) || index < 0 || index > 8 || this.board[index]) return false;
    this.board[index] = 'X'; this.result = gameResult(this.board);
    if (this.result) this.state = 'finished';
    else { this.turn = 'him'; this.nextMove = now + 0.6; }
    return true;
  }
  update(now: number) {
    if (this.state !== 'playing' || this.turn !== 'him' || now < this.nextMove) return;
    const i = chooseGameMove(this.board);
    if (i >= 0) this.board[i] = 'O';
    this.result = gameResult(this.board);
    if (this.result) this.state = 'finished'; else this.turn = 'you';
  }
}
