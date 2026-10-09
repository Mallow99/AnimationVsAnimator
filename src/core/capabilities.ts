import type { PropDef } from "./props";
export const PROP_ACTIONS = [
  "sit",
  "watch",
  "ride",
  "paint",
  "drawhere",
  "refine",
  "store",
  "move",
  "switch",
] as const;
export type PropAction = (typeof PROP_ACTIONS)[number];
export function propActions(def: PropDef): PropAction[] {
  const use: Partial<Record<PropDef["use"], PropAction>> = {
    seat: "sit",
    tv: "watch",
    ride: "ride",
    canvas: "paint",
    work: "drawhere",
    storage: "store",
    light:"switch",
  };
  return [
    ...new Set([
      ...(def.actions ?? []),
      ...(use[def.use] ? [use[def.use]!] : []),
      ...(def.movable === false ? [] : ["move" as const]),
    ]),
  ];
}
