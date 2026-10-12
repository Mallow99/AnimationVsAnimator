/** Object-local project state survives interruption, transfer and save/load. */
export interface InkProject {
  source: string;
  progress: number;
  remaining: number;
}
export function parseProject(raw: unknown): InkProject | undefined {
  if (!raw || typeof raw !== "object") return;
  const o = raw as Record<string, unknown>;
  if (typeof o.source !== "string" || !/^[a-z0-9-]{1,30}$/.test(o.source))
    return;
  if (
    typeof o.progress !== "number" ||
    !Number.isFinite(o.progress) ||
    typeof o.remaining !== "number" ||
    !Number.isFinite(o.remaining)
  )
    return;
  return {
    source: o.source,
    progress: Math.max(0, Math.min(1, o.progress)),
    remaining: Math.max(-1, Math.min(86400, o.remaining)),
  };
}
