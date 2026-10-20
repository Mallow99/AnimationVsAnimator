import type { Ctx } from '../skills/context';
import { offlineReply, isActionRequest, type OfflineReply } from './offline';

export const MESSAGE_LIMIT = 4000;
export const TRANSCRIPT_LIMIT = 240;
type Topic = 'company' | 'day' | 'making' | 'games' | 'home' | 'friends' | 'story';
type StoryPlace = 'door' | 'river' | 'tower' | 'garden' | 'home';
interface ConversationState {
  v: 1;
  topic: Topic;
  turns: number;
  depth: number;
  facts: { name: string; likes: string; project: string; day: string };
  detail: string;
  story: { place: StoryPlace; item: string; visited: StoryPlace[] } | null;
}
const topics: Topic[] = ['company', 'day', 'making', 'games', 'home', 'friends', 'story'];
const places: StoryPlace[] = ['door', 'river', 'tower', 'garden', 'home'];
const clean = (v: unknown, n = 160) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const fresh = (): ConversationState => ({ v: 1, topic: 'company', turns: 0, depth: 0,
  facts: { name: '', likes: '', project: '', day: '' }, detail: '', story: null });
const quote = (s: string) => `“${s.slice(0, 180)}${s.length > 180 ? '…' : ''}”`;

/** Authored dialogue with topic, facts, follow-ups and branching fiction. No fetch, model or keys.
 * This deliberately does not pretend to understand arbitrary subjects or answer factual questions.
 */
export class OfflineConversation {
  private state = fresh();
  reset() { this.state = fresh(); }
  save(): ConversationState { return structuredClone(this.state); }
  load(raw: unknown) {
    this.reset();
    if (!raw || typeof raw !== 'object') return;
    const d = raw as Partial<ConversationState>, s = this.state;
    if (d.v !== 1) return;
    if (topics.includes(d.topic!)) s.topic = d.topic!;
    for (const k of ['turns', 'depth'] as const)
      if (Number.isSafeInteger(d[k]) && d[k]! >= 0) s[k] = Math.min(100000, d[k]!);
    if (d.facts && typeof d.facts === 'object')
      for (const k of Object.keys(s.facts) as (keyof typeof s.facts)[]) s.facts[k] = clean(d.facts[k]);
    s.detail = clean(d.detail);
    if (d.story && places.includes(d.story.place)) s.story = { place: d.story.place,
      item: clean(d.story.item, 40) || 'lantern', visited: Array.isArray(d.story.visited)
        ? d.story.visited.filter(p => places.includes(p)).slice(-12) : [] };
  }
  private topic(topic: Topic) {
    if (this.state.topic !== topic) { this.state.topic = topic; this.state.depth = 0; }
    else this.state.depth++;
  }
  private reply(say: string): OfflineReply { return { say, plan: [] }; }

  respond(c: Ctx, input: string, name: string): OfflineReply {
    const text = input.trim().slice(0, MESSAGE_LIMIT), t = text.toLowerCase().replace(/[’]/g, "'");
    const s = this.state, f = s.facts;
    s.turns++;
    const action = isActionRequest(text);
    // Inspect social language before the command vocabulary. A story about a fight is just a story.
    if (/^(?:please )?(?:stop|enough|cancel|don't|do not)\b/.test(t)) return offlineReply(c, text);
    if (/^(?:new topic|change (?:the )?(?:topic|subject)|something else)\b/.test(t)) {
      this.topic('company'); s.story = null;
      return this.reply('Fresh subject, then. We could invent a story, talk about your day, or trade ideas for something you’re making. Which sounds good?');
    }
    if (/^(?:my name is|call me|actually,? (?:my name is|call me))\s+/i.test(text)) {
      f.name = text.replace(/^(?:actually,? )?(?:my name is|call me)\s+/i, '').split(/[.!?\n]|\s+and\s+/)[0].trim().slice(0, 40);
      // Keep the existing memory view useful, without adding a duplicate on every greeting.
      const existing = c.memory.notes.find(n => /the person's name is/i.test(n.text));
      if (existing) c.memory.edit(existing.id, `the person's name is ${f.name}`);
      else c.memory.add(`the person's name is ${f.name}`, 'you', 'him', 3);
      return this.reply(`${f.name}. Got it. I’m ${name}, the one taking up a very small part of your screen. What’s been keeping you busy lately?`);
    }
    if (/\b(?:what (?:is|was|are|do)|what's|do you remember|remember)\b/.test(t) && /\b(?:my name|about me|told you|remember me|i(?:'m| am) working on|my favou?rite|i like)\b/.test(t)) {
      const facts = [f.name && `You asked me to call you ${f.name}.`, f.likes && `You like ${f.likes}.`,
        f.project && `You’re working on ${f.project}.`, f.day && `You told me about ${quote(f.day)}.`].filter(Boolean);
      return this.reply(facts.length ? facts.join(' ') + ' You can correct any of that, or use New conversation to clear this chat’s context.'
        : c.memory.notes.find(n => /the person's name is/i.test(n.text))?.text ?? 'We haven’t saved any details in this conversation yet. What would you like me to call you?');
    }
    const likes = /\b(?:i (?:really )?(?:like|love|enjoy)|my favou?rite (?:\w+ )?is)\s+([^.!?\n]+)/i.exec(text);
    const project = /\bi(?:'m| am) (?:working on|making|building|creating|writing|learning)\s+([^.!?\n]+)/i.exec(text);
    if (likes) f.likes = clean(likes[1]);
    if (project) f.project = clean(project[1]);
    if (/\b(?:tell (?:me|us)|start|invent|make up|another|continue|keep going).*\bstory\b|\bstory (?:please|time)\b/.test(t)) {
      this.topic('story');
      if (!s.story || /\b(?:new|another|start|begin)\b/.test(t)) s.story = { place: 'door', item: 'lantern', visited: [] };
      return this.story(t, true);
    }
    if (s.topic === 'story' && s.story && !/\b(?:my day|my project|how are you|who are you|how do you work)\b/.test(t))
      return this.story(t);
    if (action) return offlineReply(c, text);
    if (/^(?:surprise me|thanks|thank you|i (?:love|hate) you|(?:you(?:'re| are)?|your)\s+(?:so\s+)?(?:stupid|dumb|ugly|useless|cute|awesome|cool))\b/.test(t)) {
      const social = offlineReply(c, text);
      if (social.understood !== false) return social;
    }
    if (/\b(?:how (?:are you|do you feel)|you ok|what's wrong)\b/.test(t)) {
      const mood = offlineReply(c, 'how are you').say;
      return this.reply(`${mood[0].toUpperCase()}${mood.slice(1)} I’ve got ${c.items.onHim.length} things with me and ${c.peers?.().length ?? 0} friends around. What about you${f.name ? `, ${f.name}` : ''}—a quiet day or an eventful one?`);
    }
    if (/\b(?:who are you|your name|how do you work|are you (?:an? )?ai|need.*key|without.*key|offline)\b/.test(t))
      return this.reply(`I’m ${name}. I live here, borrow the furniture, and occasionally make questionable decisions with a pen. This conversation runs locally: I keep track of topics, details you share, and our story choices. I can’t reason about every subject like a language model. No account or AI key needed. Want to talk about your day or make up a story together?`);
    if (/\b(?:what are you doing|what are you up to)\b/.test(t)) return this.reply(`${offlineReply(c, text).say} We can talk while I’m settled. A message about reading won’t make me abandon what I’m doing; ask “read a book” when you want the action.`);
    if (/^(?:hi|hello|hey|yo|sup)\b/.test(t)) {
      return this.reply(s.turns > 1 ? `Hey${f.name ? `, ${f.name}` : ''}. ${f.project ? `How’s ${f.project} coming along?` : 'Good to have you back. What’s on your mind?'}`
        : `Hey. I’m ${name}. We can actually take our time here. Tell me about your day, something you’re making, or ask for a story we can steer together.`);
    }
    if (/\b(?:what can (?:we|you)|help|suggest.*topic)\b/.test(t))
      return this.reply('We can talk about your day, games, making things, my friends, or life on the desktop. “Tell me a story” starts an adventure where you choose what happens next. You can ask “why?”, “tell me more”, or “what about you?” to stay with a topic. For actions, ask directly: “dance” or “read a book”.');

    let topic: Topic | undefined;
    if (project || /\b(?:project|making|building|creating|ideas?|learning|drawing|art|design|code|coding)\b/.test(t)) topic = 'making';
    else if (/\b(?:day|today|school|work|tired|sad|happy|lonely|frustrated|rough|stressed|excited)\b/.test(t)) topic = 'day';
    else if (/\b(?:games?|gaming|othello|pong|winning|losing|minecraft)\b/.test(t)) topic = 'games';
    else if (/\b(?:friends?|friendship|cobalt|amber|ruby|leonard|blurp)\b/.test(t)) topic = 'friends';
    else if (/\b(?:desktop|windows?|furniture|books?|reading|screen|home|pen)\b/.test(t)) topic = 'home';
    const followup = /^(?:yes|yeah|yep|no|nope|maybe|sure|okay|ok|why|how so|tell me more|go on|keep going|continue|what (?:about|do) you|and you|both|the first|the second)\b/.test(t);
    if (topic) this.topic(topic);
    else if (s.topic !== 'company') this.topic(s.topic);
    if (!followup) s.detail = clean(text);
    if (s.topic === 'day' && !followup) f.day = clean(text);
    const detail = s.detail ? quote(s.detail) : 'that';
    const own = /\b(?:what about you|and you|do you|your day|your life|your favou?rite)\b/.test(t);
    const why = /^(?:why|how so|tell me more|go on|continue|keep going)\b/.test(t);
    const no = /^(?:no|nope|not really)\b/.test(t);
    if (no) return this.reply(`Fair enough. We can leave ${s.topic === 'company' ? 'that' : 'this subject'} there. Would you rather change the topic, hear a story, or just have some quiet company?`);
    const voice = c.personality === 'competitive' ? 'I’d turn it into a challenge. Small goal, one honest attempt, then a rematch.'
      : c.personality === 'gentle' ? 'I’d start gently. There’s no timer on getting it right.'
      : c.personality === 'adventurous' ? 'I’d try the unfamiliar route first. There’s usually something worth finding.'
      : c.personality === 'mischievous' ? 'I’d test the silly version first. Sometimes the accident is the best bit.'
      : 'I’d sketch a tiny version and see what it teaches me.';
    switch (s.topic) {
      case 'making': {
        const subject = f.project ? `your ${f.project}` : 'the idea';
        return this.reply(own ? `${voice} With ${subject}, I’d want one part to feel good before piling on the rest. What’s the smallest version you’d be pleased to show somebody?`
          : why ? `A small version gives you something real to react to. When I draw something enormous before testing a corner, I mostly discover that I’ve run out of screen. For ${subject}, is the hard part choosing what to make, or getting a particular piece to work?`
          : s.depth % 3 === 0 ? `${project ? `You’re working on ${f.project}.` : `You mentioned ${detail}.`} ${voice} Which bit are you most excited about, and which bit keeps getting in the way?`
          : s.depth % 3 === 1 ? `That adds another piece: ${detail}. I’d separate the part you can try now from the part that needs more thinking. If you could improve only one thing in ${subject} today, what would it be?`
          : `For ${subject}, we’ve got a direction, but I don’t want to invent your answer for you. What would “good enough to try” look like? You can describe a rough version; it doesn’t need to be polished.`);
      }
      case 'day': return this.reply(own ? `${voice} My day is mostly little things: a comfortable place to sit, someone saying hi, a drawing that behaves itself. What was one small thing in your day that stood out?`
        : why ? `I asked because ${f.day ? `you mentioned ${quote(f.day)}` : 'you brought up your day'}, and I’d rather follow your lead than decide what you need. We can talk it through, find a distraction, or leave it alone. Which would help right now?`
        : s.depth % 3 === 0 ? `You said ${detail}. I’m here. Do you want to tell me what happened, or would a small distraction feel better?`
        : s.depth % 3 === 1 ? `${detail}—thanks for telling me a bit more. Was that the main part of the day, or did something else stick with you too?`
        : `We can take this slowly${f.name ? `, ${f.name}` : ''}. ${f.likes ? `You told me you like ${f.likes}; is there room for a little of that today?` : 'What would make the next little part of your day nicer?'}`);
      case 'games': return this.reply(own ? `${voice} I like games where the other player can surprise me. Pong is quick; Othello gives me time to regret my choices. Do you enjoy figuring out a system, competing, or wandering around in it?`
        : why ? 'A good game gives you an interesting choice, then lets you see what that choice changed. A close loss can be more fun than a win you didn’t have to think about. What’s a game that did that for you?'
        : `You mentioned ${detail}. ${s.depth % 2 ? 'What makes you come back to it: the challenge, the world, or the people?' : 'What was your best moment playing? I like hearing the part you still remember afterward.'}`);
      case 'friends': {
        const peers = c.peers?.() ?? [];
        const friend = peers.find(p => t.includes(p.name.toLowerCase())) ?? peers[0];
        const bond = friend?.id ? c.relationship?.(friend.id) : undefined;
        return this.reply(friend ? `${friend.name} is ${friend.doing || friend.mode} right now. ${bond?.lastShared ? `Our recent shared history includes ${bond.lastShared}.` : 'We’re still making our own little history here.'} ${own || why ? 'I like having company without everybody needing to do the same thing. A quiet friend counts too.' : `You said ${detail}.`} What do you enjoy doing with a friend?`
          : `It’s just me here at the moment. I can talk about friends without summoning anybody or interrupting their activities. ${voice} What makes somebody easy for you to spend time with?`);
      }
      case 'home': return this.reply(own || why ? `I like a place that lets me settle without getting stuck. A book, enough room for my elbows, and a friend nearby is a pretty good start. ${c.props?.placed.length ? `We’ve got ${c.props.placed.length} pieces of furniture out here.` : 'It’s fairly open here right now.'} What would you put in your ideal little corner?`
        : `You mentioned ${detail}. Living on a desktop makes ordinary things seem enormous: a window edge is a rooftop, a pen is a whole workshop. ${s.depth % 2 ? 'What’s one detail you’d change about this place?' : 'Would your ideal corner be cozy and quiet, or full of things to try?'}`);
      default:
        if (likes) return this.reply(`${f.likes}—I’ll remember that in this conversation. What’s the part you enjoy most about it?`);
        if (/\b(?:thanks|thank you)\b/.test(t)) return this.reply(`Any time${f.name ? `, ${f.name}` : ''}. We can keep talking, change the subject, or just hang out.`);
        if (/\b(?:joke|funny)\b/.test(t)) return this.reply(`I drew an emergency exit. Then I remembered I’m made of lines too. Awkward.

Want to invent a better joke together, or try a story?`);
        return this.reply(`I caught ${detail}, but I don’t have a reliable answer to every subject. ${s.turns % 2 ? 'Is this something from your day, an idea you’re working on, or something you want to imagine together?' : 'We can talk about making things, games, friends, or start an adventure with “tell me a story”. Where should we take it?'}`);
    }
  }

  private story(t: string, opening = false): OfflineReply {
    const s = this.state, story = s.story!;
    const before = story.place;
    const lantern = /\b(?:lantern|light)\b/.test(t), key = /\bkey\b/.test(t);
    if (opening && before === 'door') return this.reply(`Let’s make this one together.

Behind the smallest window on the desktop, we find a door drawn in blue ink. It opens onto a place that shouldn’t fit: a river of moving pixels, a tower made of abandoned sketches, and a garden where unfinished ideas keep growing.

On the doorstep are a brass key and a paper lantern. We can carry one. Which do we take, and do we head for the river or the tower?`);
    if (lantern) story.item = 'lantern';
    else if (key) story.item = 'brass key';
    const destination = /\b(?:river|water|bridge|boat)\b/.test(t) ? 'river'
      : /\b(?:tower|stairs|sketches)\b/.test(t) ? 'tower'
      : /\b(?:garden|seed|plant)\b/.test(t) ? 'garden'
      : /\b(?:home|return|back to.*door|finish|end)\b/.test(t) ? 'home' : undefined;
    if (destination) story.place = destination;
    else if (/^(?:yes|sure|continue|go on|keep going|then|tell me more)\b/.test(t))
      story.place = before === 'door' ? 'river' : before === 'river' ? 'garden' : before === 'tower' ? 'garden' : 'home';
    else if (before === 'door' && (lantern || key))
      return this.reply(`We pick up the ${story.item}. It weighs almost nothing, but the ink door seems pleased we chose carefully. The river rustles to our left; somewhere in the tower, a bell rings once. River or tower?`);
    else if (!destination) return this.reply(`We can try ${quote(t)} as an idea for the scene, but I need a direction to move our adventure forward. We’re at the ${before}, carrying the ${story.item}. Shall we try the river, the tower, the garden, or head home?`);
    const revisiting = story.visited.includes(story.place);
    story.visited.push(story.place); story.visited = story.visited.slice(-12);
    const intro = revisiting ? `Back at the ${story.place}, we notice what changed since our first visit. ` : '';
    switch (story.place) {
      case 'river': return this.reply(`${intro}The river carries little scraps of forgotten drawings. A paper boat bumps the bank, empty except for a note: “Nothing unfinished is wasted.”

${story.item === 'lantern' ? 'Our lantern shines through the water. Underneath is a bridge, drawn so faintly we couldn’t see it before. We step across, keeping the light low.' : 'A tiny lock holds the boat to its mooring. Our brass key fits. We climb in, and the current takes us toward a green patch beyond the tower.'}

There’s a garden on the far bank, and a staircase winding back toward the tower. Which way?`);
      case 'tower': return this.reply(`${intro}The tower is full of sketches that almost became something: wings without a bird, a wheel without a cart, one very confident eyebrow.

${story.item === 'brass key' ? 'The key opens a little cupboard. Inside is a seed shaped like a punctuation mark, waiting for the end of its sentence.' : 'The lantern casts all the unfinished shapes onto one wall. Together they look like a tree. At its feet, a real seed drops out of the drawing.'}

We could take the seed to the garden, explore the river, or carry our discovery home. What would you choose?`);
      case 'garden': return this.reply(`${intro}In the garden, the unfinished things are growing slowly. A roof has become a leaf. Somebody’s abandoned spiral is a very happy snail.

${story.visited.includes('tower') ? 'We plant the seed from the tower. It grows into a small blue door, just like the one we came through.' : 'We find a bare patch and draw a seed of our own. It doesn’t become a grand tree. It becomes a comfortable bench—exactly enough for two.'}

${story.item === 'lantern' ? 'We hang the lantern from a branch, leaving a light for whoever comes next.' : 'We leave a little key-shaped mark on the bench so we’ll recognize this spot.'} Shall we visit the tower, follow the river, or end the adventure at home?`);
      default:
        s.topic = 'company'; s.story = null;
        return this.reply(`We slip back through the blue door. The desktop looks the same, but now we know there’s room behind it for a ${story.visited.includes('garden') ? 'garden' : 'whole other world'}.

I sit beside you for a moment. “Good trip,” I say. “I liked that we took the ${story.item}.” Then I draw one tiny mark on the door, so we can find it again.

That’s our ending. Which part would you change if we told it again? We can start another story, or talk about something from your own day.`);
    }
  }
}
