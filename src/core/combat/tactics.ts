import type { FighterView } from "../peer";
import type { Personality } from "../config";
import type { MoveName } from "../skills/swordplay";

export type CombatGoal =
  "recover" | "punish" | "break-guard" | "approach" | "probe" | "pressure";
export interface Exchange {
  goal: CombatGoal;
  moves: MoveName[];
}
/** Read the opponent's state, then choose a sequence with a purpose. No random move lottery. */
export function chooseExchange(
  foe: FighterView,
  ownPoise: number,
  distance: number,
  reach: number,
  personality: Personality = "inventive",
  last: MoveName | null = null,
): Exchange {
  if (ownPoise < 0.22 && foe.stagger <= 0)
    return { goal: "recover", moves: [] };
  if (foe.stagger > 0)
    return {
      goal: "punish",
      moves: distance > reach ? ["thrust", "heavy"] : ["heavy", "rising"],
    };
  if (distance > reach * 1.7)
    return {
      goal: "approach",
      moves: [personality === "adventurous" ? "aircut" : "dash", "cut"],
    };
  if (foe.poise < 0.38 || foe.block) {
    const opener: MoveName =
      foe.block === "high"
        ? "rising"
        : foe.block === "low"
          ? "heavy"
          : last === "heavy"
            ? "flurry"
            : "heavy";
    return {
      goal: "break-guard",
      moves: [opener, opener === "heavy" ? "thrust" : "heavy"],
    };
  }
  if (foe.move && !foe.move.windup && foe.hitstun <= 0)
    return { goal: "punish", moves: ["thrust", "cut"] };
  if (personality === "competitive")
    return {
      goal: "pressure",
      moves:
        last === "flurry" ? ["cut", "heavy"] : ["flurry", "thrust", "heavy"],
    };
  if (personality === "gentle")
    return {
      goal: "probe",
      moves: last === "thrust" ? ["feint", "cut"] : ["thrust"],
    };
  return {
    goal: "probe",
    moves:
      last === "cut"
        ? ["feint", "thrust", "rising"]
        : ["cut", "rising", "heavy"],
  };
}
