// A bounded, contextual command language for offline life. No network or model needed.
import type { Ctx } from '../skills/context';
import type { PlanStep } from '../mind';
import type { MoodState } from '../mood';
export interface OfflineReply {
  say: string;
  plan: PlanStep[];
  feel?: Partial<MoodState>;
  stop?: boolean;
}
const choose = (a: string[]) => a[Math.floor(Math.random() * a.length)];
const ACTIONS: [RegExp, string][] = [
  [/\b(?:play catch|catch with|pass the ball|throw.*ball.*friend)\b/, 'catch'],
  [/\b(?:blanket|curl up)\b/, 'blanket'],
  [/\b(?:snack|snack box)\b/, 'snack'],
  [/\b(?:lamp|reading light)\b/, 'lamp'],
  [/\b(?:sip|have a drink|drink from|drink your|tea break|coffee break)\b/, 'sip'],
  [/\b(?:exercise|work out|workout|lift weights|dumbbell|train with)\b/, 'exercise'],
  [/\b(?:yo-yo|yoyo)\b/, 'yoyo'],
  [/\b(?:pass|share|give).*tool\b/,'passtool'],
  [/\b(?:apologize|apologise|make up with|say sorry to)\b/, 'apologize'],
  [/\bcompare.*drawing\b/,'comparedrawings'],
  [/\b(?:check on|help).*friend\b/,'checkfriend'],
  [/\b(?:handhelds?|pocket games?|gameboys?|game boys?)\b.*\b(?:together|friend|friends)\b|\bhandheldduo\b/, 'handheldduo'],
  [/\b(?:handheld|game boy|gameboy|pocket console)\b/, 'handheld'],
  [/\bpong\b/, 'pong'],
  [/\b(?:carry(?: it)? together|carry.*with.*friend|help.*carry)\b/, 'carrytogether'],
  [/\b(?:move|pull|arrange|put|push).*(?:tv|television).*(?:couch|seat)\b/, 'arrange'],
  [/\breading corner\b/, 'readingcorner'],
  [/\b(?:work corner|work area)\b/, 'workcorner'],
  [/\b(?:group wave|wave together)\b/, 'group:wave'],
  [/\b(?:group chat|group conversation|talk together|chat together)\b/, 'group:chat'],
  [/\b(?:couch huddle|all.*couch|group.*couch)\b/, 'group:couch'],
  [/\b(?:group watch|everyone.*watch|all.*watch|watch together)\b/, 'group:watch'],
  [/\b(?:duet|two.*mirror)\b/, 'group:duet'],
  [/\b(?:hands in|triangle)\b/, 'group:triangle'],
  [/\b(?:four.*dance|two.pair dance)\b/, 'group:mirror'],
  [/\b(?:wave relay|five.*wave)\b/, 'group:relay'],
  [/\b(?:refine|polish|finish|color in|colour in)\b/, 'refine'],
  [/\b(?:sort|store|tidy)(?: the| your)? (?:tools|weapons|items)\b/, 'sorttools'],
  [/\b(?:blueprint|work at (?:the )?desk)\b/, 'deskwork'],
  [/\b(?:draw|make|sketch)(?: me| a| the)? katana\b/, 'drawitem:katana'],
  [/\b(?:draw|make|sketch)(?: me| a| the)? (?:tv|television)\b/, 'drawprop:tv'],
  [/\b(?:draw|make|sketch)(?: me| a| the)? couch\b/, 'drawprop:couch'],
  [/\b(?:draw|make|sketch)(?: me| a| the)? chair\b/, 'drawprop:chair'],
  [/\b(?:draw|make|sketch)(?: me| a| the)? desk\b/, 'drawprop:desk'],
  [/\b(?:watch|watching)(?: a| the| some)? (?:tv|television|movie|film)\b/, 'watchtv'],
  [/\b(?:read|reading)(?: a| your| the)?(?: book)?\b/, 'read'],
  [/\b(?:close|shut) (?:this |the |that )?tab\b/, 'closetab'],
  [/\b(?:close|shut) (?:this |the |that )?window\b/, 'closewindow'],
  [
    /\b(?:take|steal|pluck|grab) (?:something|an? (?:image|picture|object)|that) (?:off|from)\b/,
    'pluck',
  ],
  [/\b(?:restore|put back) (?:the )?page\b/, 'restorepage'],
  [/\b(?:enter|visit|go into|crawl into) (?:a |the |my )?file\b/, 'file'],
  [/\b(?:enter|visit|go into|crawl into) (?:a |the |my )?folder\b/, 'folder'],
  [
    /\b(?:draw|make|sketch) (?:me |a |an? |your |another )*(?:gun|pistol)\b/,
    'drawgun',
  ],
  [
    /\b(?:draw|make|sketch) (?:me |a |your |another )*(?:sword|weapon|tool)\b/,
    'drawtool',
  ],
  [/\b(?:draw|make) (?:me |a )*ball\b/, 'drawball'],
  [/\b(?:draw|make) (?:me |a )*(?:box|block)\b/, 'drawbox'],
  [/\b(?:high[ -]?five)\b/, 'highfive'],
  [/\bfist[ -]?bump\b/, 'fistbump'],
  [/\bpatty[ -]?cake\b/, 'pattycake'],
  [/\b(?:handshake|shake hands)\b/, 'handshake'],
  [/\bhug\b/, 'hug'],
  [/\b(?:give|make|bring|wrap)(?: a| your| them a| him a| her a)? (?:gift|present)\b/, 'gift'],
  [/\b(?:handhelds?|pocket games?|gameboys?|game boys?)\b.*\b(?:together|friend|friends)\b|\bhandheldduo\b/, 'handheldduo'],
  [/\b(?:handhelds?|pocket games?|gameboys?|game boys?)\b/, 'handheld'],
  [/\b(?:talk to|chat with)\b/, 'chat'],
  [/\b(?:sit with|sit together)\b/, 'sitwith'],
  [/\b(?:nap together|sleep together)\b/, 'naptogether'],
  [/\b(?:join|watch together)\b/, 'jointv'],
  [
    /\b(?:duel|spar with|fight your friend|fight him|fight each other|sword fight)\b/,
    'duel',
  ],
  [
    /\b(?:video games?|videogame|gaming|play games|play your game)\b/,
    'videogame',
  ],
  [
    /\b(?:othello|reversi|board game|play a game|play with me|play together)\b/,
    'playgame',
  ],
  [/\b(?:paint|canvas)\b/, 'paint'],
  [/\b(?:draw|doodle|sketch)\b/, 'doodle'],
  [
    /^(?:pistol|gun)$|\b(?:shoot|fire)(?: the| your| a)? (?:gun|pistol)\b|^fire$/,
    'gun',
  ],
  [/\b(?:shoot|arrows?|archery)\b/, 'shoot'],
  [/\b(?:dance|boogie)\b/, 'dance'],
  [/\b(?:backflip)\b/, 'backflip'],
  [/\b(?:frontflip|flip)\b/, 'frontflip'],
  [/\b(?:jump|hop)\b/, 'hop'],
  [/\b(?:sit)\b/, 'sit'],
  [/\b(?:sleep|nap|rest)\b/, 'sleep'],
  [/\bwake\b/, 'wake'],
  [/\b(?:climb)\b/, 'climb'],
  [/\b(?:get down|come down)\b/, 'getdown'],
  [/\b(?:sword|swing|slash)\b/, 'swing'],
  [/\b(?:fight|punch|spar|box|attack|hit me)\b/, 'spar'],
  [/\b(?:mallet|hammer|mace|smash|bonk)\b/, 'smash'],
  [/\b(?:bounce)\b/, 'bounce'],
  [/\b(?:throw|catch|ball)\b/, 'throw'],
  [/\bsurf\b/, 'surf'],
  [/\bknock\b/, 'knock'],
  [/\b(?:kick|push|move) (?:that |the |a )?window\b/, 'pushwindow'],
  [/\b(?:edge|dangle|ledge)\b/, 'ledgesit'],
  [/\b(?:wave|bye)\b/, 'wave'],
  [/\bstretch\b/, 'stretch'],
];
const moodLine = (c: Ctx) => {
  const s = c.mood.s;
  if (s.energy < 0.3 && s.happiness > 0.65) return 'happy, but I need a nap.';
  if (s.annoyance > 0.5 && s.trust > 0.6)
    return 'I like you. still annoyed though.';
  if (s.fear > 0.25 && s.happiness > 0.6)
    return 'excited. a little nervous too.';
  return {
    sleepy: 'tired...',
    sad: 'not great',
    lonely: 'missed having company',
    angry: 'mad. at you.',
    annoyed: 'kinda annoyed',
    scared: 'a little scared',
    nervous: 'bit jumpy',
    playful: 'ready for anything!',
    excited: 'AMAZING',
    happy: 'happy :)',
    bored: 'need something to do',
    content: 'pretty good',
    proud: 'did you see that?',
    embarrassed: "don't ask",
    supported:'good. glad my friends are here.',frustrated:'that didn’t work. I need a breather.',overwhelmed:'a bit much right now. quiet sounds nice.',
  }[c.mood.emotion];
};
export function offlineReply(c: Ctx, text: string): OfflineReply {
  const t = text.toLowerCase().trim(),
    plan: PlanStep[] = [];
  const name = /my name is ([a-z][a-z'-]{0,20})/i.exec(text)?.[1];
  if (name) {
    const n = name[0].toUpperCase() + name.slice(1);
    c.memory.add(`the person's name is ${n}`, 'you', 'him', 3);
    return { say: `${n}. got it.`, plan: [{ do: 'wave' }] };
  }
  if (/^(?:please )?(?:stop|enough|cancel|don't|do not)\b/.test(t))
    return { say: 'ok. stopping.', plan: [], stop: true };
  if (
    /\b(?:how are you|how do you feel|how's it going|you ok|what's wrong)\b/.test(
      t,
    )
  )
    return { say: moodLine(c), plan: [] };
  if (/\b(?:what are you doing|what are you up to)\b/.test(t))
    return {
      say: c.mood.asleep
        ? 'napping. shh.'
        : c.char.mode === 'climb'
          ? 'finding a better view.'
          : 'seeing what trouble I can get into.',
      plan: [],
    };
  if (
    /\b(?:what do you remember|remember me|what is my name|what's my name)\b/.test(
      t,
    )
  ) {
    const note = c.memory.notes.find((n) =>
      /the person's name is/i.test(n.text),
    );
    return {
      say:
        note?.text ??
        c.memory.recall('greet') ??
        "we're still getting to know each other.",
      plan: [],
    };
  }
  if (/\b(?:who are you|your name)\b/.test(t))
    return {
      say: `${c.personality === 'competitive' ? 'your future champion' : 'your resident troublemaker'}.`,
      plan: [],
    };
  // Named partners are resolved before a plan begins, keeping an entire exchange on one recipient.
  const partner = c.peers?.().find((p) => t.includes(p.name.toLowerCase()));
  if (partner?.id) c.selectPeer?.(partner.id);
  const clauses = t.split(/\s+(?:and then|then|and)\s+|[;,]/).slice(0, 4);
  for (const clause of clauses) {
    if (/\b(?:come here|come over|follow me)\b/.test(clause)) {
      plan.push({ walk: 'cursor' });
      continue;
    }
    if (/\b(?:go away|leave me alone)\b/.test(clause)) {
      plan.push({ walk: 'away' });
      continue;
    }
    const action = ACTIONS.find(([re]) => re.test(clause));
    const definitions = [...c.items.defs.values(),...(c.props?.defs.values()??[])];
    const mentions=(name:string)=>new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(clause);
    const drawing = /\b(?:draw|sketch|make)\b/.test(clause) ? definitions.find(d=>d.drawable!==false && (mentions(d.name)||mentions(d.id))) : undefined;
    if (!action && !drawing) continue;
    let doName = drawing && (!action || !action[1].startsWith('draw')) ? `${c.props?.defs.has(drawing.id)?'drawprop':'drawitem'}:${drawing.id}` : action![1];
    if (doName === 'pushwindow' && /kick/.test(clause)) doName = 'kickwindow';
    if (doName === 'spar' && c.mood.label === 'angry') doName = 'brawl';
    const repeats = Math.min(
      4,
      Number(/\b([1-4]) times?\b/.exec(clause)?.[1] ?? 1),
    );
    const recipient = c
      .peers?.()
      .find((p) => clause.includes(p.name.toLowerCase()));
    for (let i = 0; i < repeats; i++)
      plan.push({
        do: doName,
        ...(recipient?.id ? { with: recipient.id } : {}),
      });
  }
  if (plan.length)
    return {
      say:
        c.personality === 'competitive'
          ? choose(['watch this.', 'easy.', 'challenge accepted.'])
          : c.personality === 'gentle'
            ? 'sure.'
            : choose(['on it.', 'one sec.', 'got an idea.']),
      plan: plan.slice(0, 8),
    };
  if (/^(?:hi|hello|hey|yo|sup)\b/.test(t))
    return {
      say:
        c.memory.recall('greet') ??
        (c.personality === 'competitive'
          ? 'hey! ready for a rematch?'
          : 'hey!'),
      plan: [{ do: 'wave' }],
    };
  if (/\b(?:love|good boy|cute|awesome|cool|thanks|thank you)\b/.test(t))
    return {
      say:
        c.personality === 'competitive'
          ? 'knew you liked that.'
          : choose(['aw.', 'you too.', ':)']),
      plan: [{ do: 'laugh' }],
      feel: { happiness: 0.08, trust: 0.02 },
    };
  if (/\b(?:stupid|dumb|hate|ugly|useless)\b/.test(t))
    return {
      say: choose(['rude.', 'wow.', 'hmph.']),
      plan: [{ do: 'stomp' }],
      feel: { happiness: -0.1, annoyance: 0.2, trust: -0.03 },
    };
  if (/\b(?:joke|funny|lol|haha)\b/.test(t))
    return {
      say:
        c.personality === 'competitive'
          ? 'my losing streak? never heard of it.'
          : 'I drew a door. still knocked first.',
      plan: [{ do: 'laugh' }],
    };
  if (/\b(?:bored|something fun|surprise me)\b/.test(t))
    return {
      say: 'I have an idea.',
      plan: [
        { do: c.items.find('draw') ? 'drawtool' : 'explore' },
        { do: c.foe?.() ? 'highfive' : 'dance' },
      ],
    };
  if (/\b(?:sad|rough day|bad day)\b/.test(t))
    return {
      say:
        c.personality === 'competitive'
          ? 'want a distraction? I can lose one round.'
          : 'I can sit with you for a bit.',
      plan: [{ walk: 'cursor' }, { do: 'sit' }],
      feel: { fear: 0.03, trust: 0.02 },
    };
  return {
    say: choose([
      'I know moves, games, drawing and friends. what should we try?',
      "I didn't catch that. try a short request?",
      'want me to draw something, or go find a friend?',
    ]),
    plan: [],
  };
}
