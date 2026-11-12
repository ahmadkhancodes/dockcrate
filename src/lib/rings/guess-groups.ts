/**
 * First-run default for the ring picker: preselect the groups an admin most likely made for this (DC-Pilot and
 * DC-Broad as the docs suggest, or the usual "Pilot", "Test", "All users" names). Only a suggestion: nothing is saved
 * until the user presses Save, and a name that fits neither ring leaves the picker empty.
 */
const PILOT = [/\bdc[-_ ]?pilot\b/i, /pilot/i, /\b(ring ?0|ring ?1|early|test(ers|ing)?|canary|it devices)\b/i];
const BROAD = [/\bdc[-_ ]?broad\b/i, /broad/i, /\b(ring ?2|prod(uction)?|all (users|devices|staff)|everyone)\b/i];

export function guessRingGroups<G extends { id: string; displayName: string }>(groups: G[]): { pilot: string; broad: string } {
  const pick = (rules: RegExp[], not = "") => {
    for (const r of rules) {
      const g = groups.find((x) => x.id !== not && r.test(x.displayName));
      if (g) return g.id;
    }
    return "";
  };
  const pilot = pick(PILOT);
  return { pilot, broad: pick(BROAD, pilot) };
}
