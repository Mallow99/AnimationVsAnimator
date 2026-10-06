import type { Pet } from '../core/pet';
import { propActions, type PropAction } from '../core/capabilities';
import { availableForGroup } from '../core/skills/group';

export interface ActivityChoice { group: string; label: string; command: string; hint: string; needs?: string }

/** The same offline actions, with their requirements visible before the user starts one. */
export function activitiesFor(p: Pet): ActivityChoice[] {
  const choices: ActivityChoice[] = [];
  const props = p.props.placed.filter(t => !t.held && !t.movingBy && Math.abs(t.tilt) < 0.35);
  const has = (id: string) => props.some(t => t.def?.id === id || t.ink?.source === id);
  const capability = (action: PropAction) => props.some(t => t.def && propActions(t.def).includes(action));
  const friends = (p.ctx.peers?.() ?? []).filter(availableForGroup).length;
  const pen = p.items.list.some(i => i.def.use === 'draw' && i.where !== 'cursor');
  const add = (group: string, label: string, command: string, hint: string, needs?: string) => choices.push({ group, label, command, hint, needs: p.mood.asleep ? 'Wake the figure first.' : !p.char.whole ? 'Repair the figure first.' : needs });
  add('Everyday', 'Read a book', 'read', 'Settle down with a book.');
  add('Everyday', 'Sit down', 'sitdown', 'Use a free chair or couch.', !capability('sit') ? 'Place a chair or couch from Supplies.' : undefined);
  add('Everyday', 'Watch TV', 'watchtv', 'Relax and watch a show.', !capability('watch') ? 'Place a TV from Supplies.' : undefined);
  add('Everyday', 'Doodle', 'doodle', 'Draw with the figure’s pen.', !pen ? 'Give this figure a pen from Supplies.' : undefined);
  add('Everyday', 'Paint on a canvas', 'paint', 'Make a picture on the canvas.', !capability('paint') ? 'Place a canvas from Supplies.' : !pen ? 'Give this figure a pen.' : undefined);
  add('Workshop', 'Make a desk blueprint', 'deskwork', 'Trace a katana on paper and keep a copy.', !has('desk') ? 'Place a desk from Supplies.' : !pen ? 'Give this figure a pen.' : undefined);
  add('Workshop', 'Finish an ink project', 'refine', 'Color and polish the existing object.', !capability('refine') ? 'Place a workbench from Supplies.' : !p.items.list.some(i => i.ink && i.where !== 'cursor') && !props.some(t => t.ink && !t.sitters.size) ? 'Draw a tool or furniture first.' : undefined);
  add('Workshop', 'Sort loose tools', 'sorttools', 'Collect tools and arrange them on the shelf.', !capability('store') ? 'Place a tool shelf from Supplies.' : !p.items.list.some(i => i.where === 'world') ? 'Drop some of this figure’s tools on the desktop.' : undefined);
  for (const [kind, defs] of [['item', p.items.defs], ['prop', p.props.defs]] as const)
    for (const def of defs.values())
      if (def.drawable !== false && !('drawn' in def && def.drawn))
        add('Draw something', `Draw ${def.name.toLowerCase()}`, `draw${kind}:${def.id}`, 'Trace it and bring a working ink version to life.', !pen ? 'Give this figure a pen from Supplies.' : undefined);
  for (const [act, label, count, hint] of [
    ['wave', 'Group wave', 2, 'Wave together · 2–5 figures'], ['chat', 'Group conversation', 2, 'Take turns talking · 2–5 figures'],
    ['couch', 'Couch huddle', 2, 'Share a couch · 2–5 figures'], ['watch', 'Watch together', 2, 'Watch the same TV · 2–5 figures'],
    ['duet', 'Mirrored duet', 2, 'Two figures mirror each other'], ['triangle', 'Hands in', 3, 'Three figures meet in the middle'],
    ['mirror', 'Two-pair dance', 4, 'Four figures mirror in pairs'], ['relay', 'Wave relay', 5, 'Five figures pass a wave along'],
  ] as const) {
    const needs = friends < count - 1 ? `Needs ${count} free, awake figures on the floor.` : act === 'couch' && !props.some(t => t.seatRoom >= Math.min(5, friends + 1) && !t.sitters.size) ? 'Place a free couch from Supplies.' : act === 'watch' && !capability('watch') ? 'Place a TV from Supplies.' : !['ground', 'sit'].includes(p.char.mode) ? 'Bring this figure down to the floor.' : undefined;
    add('Together', label, `group:${act}`, hint, needs);
  }
  const tv = !capability('watch') ? 'Place a TV from Supplies.' : undefined;
  add('Games', 'Play Pong', 'pong', 'Two players, spectators and a paddle you can join.', tv ?? (friends < 1 ? 'Needs two free, awake figures on the floor.' : !['ground', 'sit'].includes(p.char.mode) ? 'Bring this figure down to the floor.' : p.config.consoleRequired && !props.some(t => t.def?.use === 'tv' && t.consoleConnected) ? 'Place a console beside the TV.' : undefined));
  add('Games', 'Play Othello with me', 'playgame', 'Play a board game on the TV.', tv);
  add('Games', 'Play video games', 'videogame', 'Play the runner game on the TV.', tv);
  add('Games', 'Play a handheld', 'handheld', 'Play the runner on a handheld screen.');
  add('Arrange furniture', 'Move TV beside couch', 'arrange', 'Move and turn the TV toward the seats.', !has('tv') || !has('couch') ? 'Place a TV and couch from Supplies.' : undefined);
  add('Arrange furniture', 'Carry TV together', 'carrytogether', 'Two figures carry the TV to the couch.', !has('tv') || !has('couch') ? 'Place a TV and couch from Supplies.' : friends < 1 ? 'Needs two free, awake figures on the floor.' : undefined);
  add('Arrange furniture', 'Make a reading corner', 'readingcorner', 'Move a chair beside the tool shelf.', !has('chair') || !has('storage') ? 'Place a chair and tool shelf from Supplies.' : undefined);
  add('Arrange furniture', 'Make a work corner', 'workcorner', 'Move the workbench beside the desk.', !has('workbench') || !has('desk') ? 'Place a workbench and desk from Supplies.' : undefined);
  add('Friends', 'Pass a spare tool', 'passtool', 'Give a spare tool to a companion.', friends < 1 ? 'Needs a free companion.' : !p.items.onHim.some(i => !i.def.wear && i.where !== 'hand' && (i.def.use !== 'draw' || p.items.onHim.filter(q => q.def.use === 'draw').length > 1)) ? 'Give this figure a spare tool from Supplies.' : undefined);
  add('Friends', 'Compare drawings', 'comparedrawings', 'Ask a companion for feedback.', friends < 1 ? 'Needs a free companion.' : undefined);
  add('Friends', 'Check on a friend', 'checkfriend', 'Check on a hurt or fallen companion.', !(p.ctx.peers?.() ?? []).some(v => !v.asleep && !v.group && (v.hp < 0.5 || ['ragdoll', 'getup'].includes(v.mode))) ? 'No hurt or fallen friend needs help right now.' : undefined);
  return choices;
}
