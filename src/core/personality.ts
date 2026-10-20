import type { Personality } from './config';

/** Offline preferences, not just text sent to an AI. User neuron edits override these. */
export function personalityBiases(p: Personality): Record<string, number> {
  switch (p) {
    case 'competitive':
      return {
        exercise: 1.8, read: 0.65,
        duel: 1.5,
        spar: 1.35,
        videogame: 1.35,
        pong: 1.4,
        highfive: 1.2,
        drawtool: 0.8,
        chat: 0.9,
      };
    case 'gentle':
      return {
        sip: 1.8, read: 1.45,
        duel: 0.45,
        refine: 1.8, arrange: 1.6, sorttools: 1.4, checkfriend: 1.6,
        bump: 0.2,
        hug: 1.7,
        chat: 1.5,
        naptogether: 1.4,
        watchtv: 1.3,
        handshake: 1.4,
      };
    case 'mischievous':
      return {
        yoyo: 1.8, read: 0.8,
        grabcursor: 1.5,
        drawtool: 1.4,
        fistbump: 1.4,
        pattycake: 1.35,
        chat: 1.2,
      };
    case 'adventurous':
      return {
        exercise: 1.3, yoyo: 1.35, read: 0.65,
        explore: 1.5,
        pong: 1.5, handheld: 1.5,
        climb: 1.4,
        backflip: 1.3,
        surf: 1.4,
        waveat: 1.3,
      };
    default:
      return {
        read: 1.3, sip: 1.2,
        doodle: 1.5,
        deskwork: 1.6, comparedrawings: 1.4,
        drawtool: 1.7,
        drawball: 1.4,
        drawbox: 1.3,
        paint: 1.3,
        chat: 1.2,
      };
  }
}

export function signatureTalent(p: Personality): import('./relationships').Talent {
  return p === 'competitive' ? 'fighting' : p === 'gentle' ? 'building' : p === 'adventurous' ? 'games' : 'drawing';
}

/** Short offline exchanges share a topic, while each preset has its own way of responding. */
export function conversationLine(p:Personality="inventive",topic:number,reply:boolean):string {
 const openings=['What should we make next?','Anyone fancy a little challenge?','This is a good spot to rest.'];
 if(!reply)return openings[topic%openings.length];
 const replies:Record<Personality,string[]>={
  inventive:['A tiny bridge. I have a sketch.','We could build the course first.','I brought a book.'],
  competitive:['Something we can practice on.','A fair rematch? I’m ready.','One breather, then another round.'],
  gentle:['We can make it together.','I’ll cheer you on.','Stay a while. We have room.'],
  mischievous:['A bridge with a secret shortcut.','Only if tricks are allowed.','I promise to sit still. Mostly.'],
  adventurous:['A ramp! Then we try it out.','Count me in!','Let’s explore after our break.'],
 };
 return replies[p][topic%3];
}
export function everydayReply(p:Personality="inventive",kind:'taken'|'given'|'invited'):string {
 const lines:Record<Personality,[string,string,string]>={
 inventive:['Hey, I was working on that.','Ooh, an idea for this.','Let me finish this thought.'],
 competitive:['Bring that back for practice.','Good. Time to practice.','After this round?'],
 gentle:['Careful with that, please.','Thanks. I’ll look after it.','I’ll join when I’m ready.'],
 mischievous:['Hey! Borrowing, are we?','I can do a trick with that.','Save me a spot!'],
 adventurous:['Taking that on an adventure?','Let’s try it out!','Be right there after this.'],
 };
 return lines[p][kind==='taken'?0:kind==='given'?1:2];
}
