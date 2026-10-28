/** Small plain-data snapshots shared by the overlay, shell and customer controls. */
export const QUICK_ACTIVITY_IDS = ['dance', 'read', 'catch', 'watchtv', 'doodle', 'handheld', 'pong', 'duel'] as const;
export type QuickActivityId = typeof QUICK_ACTIVITY_IDS[number];

export interface QuickActivityChoice {
  id: QuickActivityId;
  label: string;
  hint: string;
  /** A current requirement prevents the request; absence means it can be requested. */
  needs?: string;
}

export interface ActivitySnapshot {
  current: {
    id: string;
    label: string;
    state: 'starting' | 'running' | 'resting';
    reason: string;
  };
  choices: QuickActivityChoice[];
}

/** Acceptance confirms the request was queued, not that an asynchronous activity finished. */
export interface ActivityRequestResult {
  accepted: boolean;
  activityId?: QuickActivityId;
  message: string;
}
