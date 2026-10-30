import type { Pet } from '../core/pet';
import { GroupActivity } from '../core/skills/group';
import { activitiesFor, type ActivityChoice } from './activities';
import { QUICK_ACTIVITY_IDS, type QuickActivityChoice, type QuickActivityId, type ActivitySnapshot, type ActivityRequestResult } from '../shared/activity';

const currentLabels: Record<string, string> = {
  drawtool:'Drawing a tool',drawprop:'Drawing furniture',drawball:'Drawing a ball',drawbox:'Making a box',drawramp:'Drawing a ramp',ropebridge:'Making a rope bridge',
  explore:'Exploring',fetchitem:'Picking something up',sorttools:'Sorting tools',readingcorner:'Arranging a reading corner',workcorner:'Arranging the work area',arrange:'Arranging furniture',carrytogether:'Moving furniture together',
  dance: 'Dancing', read: 'Reading', catch: 'Playing catch', watchtv: 'Watching TV',
  doodle: 'Drawing', handheld: 'Playing a pocket game', pong: 'Playing Pong', duel: 'Sparring',
  idle: 'Taking a break', wander: 'Wandering', sleep: 'Sleeping', nap: 'Napping',
  sit: 'Resting', sitdown: 'Getting comfortable', reattach: 'Putting a limb back on',
  together: 'Spending time together', ask: 'Inviting a friend', playgame: 'Playing Othello',
  videogame: 'Playing a TV game', sip: 'Having a drink', exercise: 'Exercising',
  yoyo: 'Playing with a yo-yo', blanket: 'Resting under a blanket', snack: 'Having a snack',
  paint: 'Painting', deskwork: 'Working at the desk', refine: 'Finishing a project',
  walking: 'Walking', ground: 'Taking a break', air: 'Falling or landing', ragdoll: 'Recovering',
  getup: 'Getting back up', held: 'Being carried', lie: 'Resting', climb: 'Climbing',
  ceiling: 'Climbing overhead', puppet: 'Moving', roll: 'Rolling',
};

function preparingLabel(id: string, label: string) {
  const action: Record<string, string> = { dance: 'dance', read: 'read', catch: 'play catch', watchtv: 'watch TV', doodle: 'draw', handheld: 'play a pocket game', pong: 'play Pong', duel: 'spar' };
  return action[id] ? `Getting ready to ${action[id]}` : `Getting ready: ${label}`;
}

function quickChoices(catalog: ActivityChoice[]): QuickActivityChoice[] {
  return QUICK_ACTIVITY_IDS.map(id => {
    const choice = catalog.find(c => c.command === id);
    // All quick commands are in activitiesFor. Fail closed if a future catalog edit removes one.
    return choice ? { id, label: choice.label, hint: choice.hint, ...(choice.needs ? { needs: choice.needs } : {}) }
      : { id, label: currentLabels[id], hint: '', needs: 'This activity is unavailable.' };
  });
}

/** Queries never try a command, manufacture an item, consume randomness or change the current skill. */
export function activitySnapshot(p: Pet): ActivitySnapshot {
  const catalog = activitiesFor(p), skill = p.mind.activeSkill;
  let id: string = skill?.name ?? (p.char.walking ? 'walking' : p.char.mode);
  let state: ActivitySnapshot['current']['state'] = skill ? p.mind.skill ? 'running' : 'starting' : p.char.walking || !['ground', 'sit', 'lie'].includes(p.char.mode) ? 'running' : 'resting';
  if (skill instanceof GroupActivity) {
    const view = skill.view;
    id = ['catch', 'pong', 'handheld'].includes(view.act) ? view.act : `group:${view.act}`;
    if (view.phase !== 'do') state = 'starting';
  }
  if (p.mood.asleep) { id = 'sleep'; state = 'resting'; }
  const label = currentLabels[id] ?? catalog.find(c => c.command === id)?.label ??
    (state === 'resting' ? 'Taking a break' : 'Going about the day');
  return {
    current: {
      id,
      label: state === 'starting' ? preparingLabel(id, label) : label,
      state,
      reason: skill ? p.mind.why : p.mood.asleep ? 'Resting until the figure wakes.' : state === 'running' ? 'Responding to the desktop.' : 'Choosing what to do next.',
    },
    choices: quickChoices(catalog),
  };
}

/** Shared preflight and actual Mind.command acceptance; a stale button never overrides a missing requirement. */
export function requestActivity(p: Pet, command: string): ActivityRequestResult {
  if (typeof command !== 'string' || !(QUICK_ACTIVITY_IDS as readonly string[]).includes(command))
    return { accepted: false, message: 'That activity is unavailable.' };
  const activityId = command as QuickActivityId;
  const choice = quickChoices(activitiesFor(p)).find(c => c.id === activityId)!;
  if (p.paused) return { accepted: false, activityId, message: 'Resume the figure before choosing an activity.' };
  if (choice.needs) return { accepted: false, activityId, message: `${p.config.name}: ${choice.needs}` };
  const accepted = p.mind.command(p.ctx, command, 'you chose this activity', true);
  return {
    accepted,
    activityId,
    message: accepted ? `${p.config.name}: ${choice.label} requested.` : `${p.config.name} cannot start that activity right now. Let the figure settle, then try again.`,
  };
}
