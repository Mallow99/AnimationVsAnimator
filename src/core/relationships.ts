export type Talent = "drawing" | "fighting" | "building" | "games";
export interface Relationship {
  bond: number;
  cooperation:number;
  care:number;
  rivalry:number;
  lastShared:string;
  recent:string[];
  activities: Record<string, number>;
  vulnerable: Record<string, number>;
  disagreements: number;
  lastDisagreement: string;
}
export function relationship(bond = 0.4): Relationship {
  return {
    bond,cooperation:.5,care:0,rivalry:0,lastShared:"",recent:[],
    activities: {},
    vulnerable: {},
    disagreements: 0,
    lastDisagreement: "",
  };
}
export function parseRelationship(raw: unknown): Relationship | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.bond !== "number" || !Number.isFinite(o.bond)) return null;
  const r = relationship(Math.max(-1, Math.min(1, o.bond)));
  const counts = (raw: unknown) =>
    Object.fromEntries(
      Object.entries(raw && typeof raw === "object" ? raw : {})
        .slice(0, 24)
        .filter(
          ([key, v]) =>
            /^[a-z0-9:-]{1,40}$/.test(key) &&
            typeof v === "number" &&
            Number.isFinite(v),
        )
        .map(([key, v]) => [key, Math.max(0, Math.min(1000, v as number))]),
    );
  for(const key of ['cooperation','care','rivalry'] as const)if(typeof o[key]==='number'&&Number.isFinite(o[key]))r[key]=Math.max(0,Math.min(1,o[key] as number));
  r.lastShared=typeof o.lastShared==='string'?o.lastShared.slice(0,40):'';
  r.recent=Array.isArray(o.recent)?o.recent.filter((v):v is string=>typeof v==='string'&&/^[a-z0-9:-]{1,40}$/.test(v)).slice(-8):[];
  r.activities = counts(o.activities);
  r.vulnerable = counts(o.vulnerable);
  r.disagreements =
    typeof o.disagreements === "number" && Number.isFinite(o.disagreements)
      ? Math.max(0, Math.min(1000, o.disagreements))
      : 0;
  r.lastDisagreement =
    typeof o.lastDisagreement === "string"
      ? o.lastDisagreement.slice(0, 80)
      : "";
  return r;
}
