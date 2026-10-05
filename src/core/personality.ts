import type { Personality } from './config';

/** Offline preferences, not just text sent to an AI. User neuron edits override these. */
export function personalityBiases(p: Personality): Record<string, number> {
  switch (p) {
    case 'competitive':
      return {
        duel: 1.5,
        spar: 1.35,
        videogame: 1.35,
        highfive: 1.2,
        drawtool: 0.8,
        chat: 0.9,
      };
    case 'gentle':
      return {
        duel: 0.45,
        bump: 0.2,
        hug: 1.7,
        chat: 1.5,
        naptogether: 1.4,
        watchtv: 1.3,
        handshake: 1.4,
      };
    case 'mischievous':
      return {
        grabcursor: 1.5,
        drawtool: 1.4,
        fistbump: 1.4,
        pattycake: 1.35,
        chat: 1.2,
      };
    case 'adventurous':
      return {
        explore: 1.5,
        climb: 1.4,
        backflip: 1.3,
        surf: 1.4,
        waveat: 1.3,
      };
    default:
      return {
        doodle: 1.5,
        drawtool: 1.7,
        drawball: 1.4,
        drawbox: 1.3,
        paint: 1.3,
        chat: 1.2,
      };
  }
}
