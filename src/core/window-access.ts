// A stubborn or protected window should not stop him playing with every other window.
export class WindowAccess {
  private blocked = new Map<number, number>();
  canMove(id: number, now: number) { return now >= (this.blocked.get(id) ?? -1); }
  refuse(id: number, now: number) { this.blocked.set(id, now + 60); }
  anyAvailable(ids: number[], now: number) { return !ids.length || ids.some((id) => this.canMove(id, now)); }
  anyBlocked(now: number) { return [...this.blocked.values()].some((until) => now < until); }
  retain(ids: number[]) { for (const id of this.blocked.keys()) if (!ids.includes(id)) this.blocked.delete(id); }
}
