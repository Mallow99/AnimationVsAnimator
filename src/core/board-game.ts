// Othello with the existing pet. Rules and opponent run offline, independently of conversation.
export type Disc = '' | 'black' | 'white';
export type Result = '' | 'you' | 'him' | 'draw';
const DIRECTIONS = [-1, 0, 1].flatMap((x) => [-1, 0, 1].filter((y) => x || y).map((y) => [x, y]));
const other = (disc: Exclude<Disc, ''>) => disc === 'black' ? 'white' : 'black';

export function openingBoard(): Disc[] {
  const board = Array<Disc>(64).fill('');
  board[27] = board[36] = 'white'; board[28] = board[35] = 'black';
  return board;
}
export function captures(board: readonly Disc[], index: number, disc: Exclude<Disc, ''>): number[] {
  if (board.length !== 64 || !Number.isInteger(index) || index < 0 || index >= 64 || board[index]) return [];
  const row = Math.floor(index / 8), col = index % 8, flipped: number[] = [];
  for (const [dx, dy] of DIRECTIONS) {
    let x = col + dx, y = row + dy; const line: number[] = [];
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === other(disc)) {
      line.push(y * 8 + x); x += dx; y += dy;
    }
    if (line.length && x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === disc) flipped.push(...line);
  }
  return flipped;
}
export function legalMoves(board: readonly Disc[], disc: Exclude<Disc, ''>): number[] {
  return board.flatMap((_, i) => captures(board, i, disc).length ? [i] : []);
}
export function score(board: readonly Disc[]) {
  return { you: board.filter((d) => d === 'black').length, him: board.filter((d) => d === 'white').length };
}
export function gameResult(board: readonly Disc[]): Result {
  if (legalMoves(board, 'black').length || legalMoves(board, 'white').length) return '';
  const s = score(board); return s.you === s.him ? 'draw' : s.you > s.him ? 'you' : 'him';
}
export function chooseGameMove(board: readonly Disc[], random = Math.random): number {
  const moves = legalMoves(board, 'white');
  if (!moves.length) return -1;
  // A casual opponent: likes corners, avoids feeding you one, otherwise varies its play.
  const value = (i: number) => {
    if ([0, 7, 56, 63].includes(i)) return 100;
    const row = Math.floor(i / 8), col = i % 8;
    const nearCorner = [0, 7, 56, 63].some((corner) => !board[corner] && Math.abs(row - Math.floor(corner / 8)) <= 1 && Math.abs(col - corner % 8) <= 1);
    return (nearCorner ? -25 : 0) + (row === 0 || row === 7 || col === 0 || col === 7 ? 5 : 0) + captures(board, i, 'white').length * 0.6 + random() * 6;
  };
  return moves.map((i) => ({ i, value: value(i) })).sort((a, b) => b.value - a.value)[0].i;
}

export class BoardGame {
  constructor(private random = Math.random) {}
  state: 'closed' | 'invite' | 'playing' | 'finished' = 'closed';
  board = openingBoard();
  turn: 'you' | 'him' = 'you';
  result: Result = '';
  notice = '';
  lastMove = -1;
  flipped: number[] = [];
  revision = 0;
  // Screen coordinates for a panel anchored to the furniture, not his speech bubble.
  anchor: { x: number; y: number } | null = null;
  private nextMove = 0;
  get moves() { return this.state === 'playing' ? legalMoves(this.board, this.turn === 'you' ? 'black' : 'white') : []; }
  get score() { return score(this.board); }
  invite() { if (this.state !== 'closed') return false; this.state = 'invite'; this.revision++; return true; }
  accept() {
    if (this.state !== 'invite' && this.state !== 'finished') return;
    this.board = openingBoard(); this.result = ''; this.turn = 'you'; this.notice = '';
    this.lastMove = -1; this.flipped = []; this.state = 'playing'; this.revision++;
  }
  close() { this.state = 'closed'; this.anchor = null; this.revision++; }
  play(index: number, now: number) {
    if (this.state !== 'playing' || this.turn !== 'you' || !Number.isFinite(now)) return false;
    return this.place(index, 'black', now);
  }
  private place(index: number, disc: Exclude<Disc, ''>, now: number) {
    const flipped = captures(this.board, index, disc);
    if (!flipped.length) return false;
    this.board[index] = disc; for (const i of flipped) this.board[i] = disc;
    this.lastMove = index; this.flipped = flipped; this.notice = ''; this.revision++;
    this.result = gameResult(this.board);
    if (this.result) { this.state = 'finished'; return true; }
    this.turn = disc === 'black' ? 'him' : 'you';
    if (!legalMoves(this.board, other(disc)).length) {
      this.notice = this.turn === 'you' ? 'You have no legal move. Your turn is passed.' : 'He has no legal move. His turn is passed.';
      this.turn = disc === 'black' ? 'you' : 'him';
    }
    this.nextMove = now + 0.8;
    return true;
  }
  update(now: number) {
    if (this.state !== 'playing' || this.turn !== 'him' || !Number.isFinite(now) || now < this.nextMove) return;
    const i = chooseGameMove(this.board, this.random);
    if (i >= 0) this.place(i, 'white', now);
  }
}
