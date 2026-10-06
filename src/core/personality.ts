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
