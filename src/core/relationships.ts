export type Talent = 'drawing' | 'fighting' | 'building' | 'games';
export interface Relationship {
  bond: number;
  cooperation: number;
  care: number;
  rivalry: number;
  lastShared: string;
  recent: string[];
  trust: number;
  familiarity: number;
  respect: number;
  generosity: number;
  giftsGiven: number;
  giftsReceived: number;
  lastGift: string;
  favoriteShared: string;
  activities: Record<string, number>;
  vulnerable: Record<string, number>;
  disagreements: number;
  lastDisagreement: string;
}
export function relationship(bond = 0.4): Relationship {
  return {
    bond,
    cooperation: 0.5,
    care: 0,
    rivalry: 0,
    lastShared: '',
    recent: [],
    trust: 0.5,
    familiarity: 0,
    respect: 0.5,
    generosity: 0,
    giftsGiven: 0,
    giftsReceived: 0,
    lastGift: '',
    favoriteShared: '',
    activities: {},
    vulnerable: {},
    disagreements: 0,
    lastDisagreement: '',
  };
}
export function parseRelationship(raw: unknown): Relationship | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.bond !== 'number' || !Number.isFinite(o.bond)) return null;
  const r = relationship(Math.max(-1, Math.min(1, o.bond)));
  const counts = (raw: unknown) =>
    Object.fromEntries(
      Object.entries(raw && typeof raw === 'object' ? raw : {})
        .slice(0, 24)
        .filter(
          ([key, v]) =>
            /^[a-z0-9:-]{1,40}$/.test(key) && typeof v === 'number' && Number.isFinite(v),
        )
        .map(([key, v]) => [key, Math.max(0, Math.min(1000, v as number))]),
    );
  for (const key of [
    'cooperation',
    'care',
    'rivalry',
    'trust',
    'familiarity',
    'respect',
    'generosity',
  ] as const)
    if (typeof o[key] === 'number' && Number.isFinite(o[key]))
      r[key] = Math.max(0, Math.min(1, o[key] as number));
  for (const key of ['giftsGiven', 'giftsReceived'] as const)
    if (typeof o[key] === 'number' && Number.isFinite(o[key]))
      r[key] = Math.max(0, Math.min(1000, Math.floor(o[key] as number)));
  for (const key of ['lastGift', 'favoriteShared'] as const)
    if (typeof o[key] === 'string' && /^[a-z0-9:-]{1,40}$/.test(o[key] as string))
      r[key] = o[key] as string;
  r.lastShared = typeof o.lastShared === 'string' ? o.lastShared.slice(0, 40) : '';
  r.recent = Array.isArray(o.recent)
    ? o.recent
        .filter((v): v is string => typeof v === 'string' && /^[a-z0-9:-]{1,40}$/.test(v))
        .slice(-8)
    : [];
  r.activities = counts(o.activities);
  r.vulnerable = counts(o.vulnerable);
  r.disagreements =
    typeof o.disagreements === 'number' && Number.isFinite(o.disagreements)
      ? Math.max(0, Math.min(1000, o.disagreements))
      : 0;
  r.lastDisagreement =
    typeof o.lastDisagreement === 'string' ? o.lastDisagreement.slice(0, 80) : '';
  return r;
}

/** Interrupted plans are neutral. Successful repeated activities have diminishing returns. */
export function sharedMoment(r: Relationship, act: string, success: boolean) {
  if (!/^[a-z0-9:-]{1,40}$/.test(act)) return;
  if (!success) {
    r.lastDisagreement = act;
    return;
  }
  const count = r.activities[act] ?? 0,
    novelty = 1 / Math.sqrt(1 + count * 0.15);
  if (Object.hasOwn(r.activities, act) || Object.keys(r.activities).length < 24)
    r.activities[act] = Math.min(1000, count + 1);
  r.bond = Math.min(1, r.bond + 0.012 * novelty);
  r.cooperation = Math.min(1, r.cooperation + 0.02 * novelty);
  r.trust = Math.min(1, r.trust + 0.008 * novelty);
  r.familiarity = Math.min(1, r.familiarity + 0.018 * novelty);
  r.respect = Math.min(1, r.respect + 0.008 * novelty);
  r.lastShared = act;
  r.recent.push(act);
  if (r.recent.length > 8) r.recent.shift();
  if (['check', 'hug', 'gift', 'apology'].includes(act))
    r.care = Math.min(1, r.care + 0.04 * novelty);
  if (['duel', 'pong', 'videogame', 'handheld', 'catch'].includes(act))
    r.rivalry = Math.min(1, r.rivalry + 0.02 * novelty);
  r.favoriteShared =
    Object.entries(r.activities)
      .filter(([key]) => !['gift', 'pass', 'check', 'apology'].includes(key))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
export function recordGift(r: Relationship, item: string, appreciation: number, received: boolean) {
  sharedMoment(r, 'gift', true);
  r.lastGift = item.slice(0, 40);
  if (received) {
    r.giftsReceived = Math.min(1000, r.giftsReceived + 1);
    r.bond = Math.min(1, r.bond + 0.008 * appreciation);
    r.generosity = Math.min(1, r.generosity + 0.04);
  } else r.giftsGiven = Math.min(1000, r.giftsGiven + 1);
}
export function disagreement(r: Relationship, kind: string) {
  r.disagreements = Math.min(1000, r.disagreements + 1);
  r.lastDisagreement = kind.slice(0, 80);
  r.trust = Math.max(0, r.trust - 0.04);
  r.bond = Math.max(-1, r.bond - 0.025);
  r.respect = Math.max(0, r.respect - 0.015);
}
export function friendshipStage(r: Relationship) {
  return r.bond < -0.15 || r.trust < 0.25
    ? 'strained'
    : r.familiarity > 0.65 && r.bond > 0.7 && r.trust > 0.65
      ? 'close friends'
      : r.familiarity > 0.2 && r.bond > 0.45
        ? 'friends'
        : r.familiarity > 0.05
          ? 'getting to know each other'
          : 'new companions';
}
