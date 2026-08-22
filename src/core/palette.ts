/**
 * Team colours, assigned in order as teams are created.
 *
 * The document owns row colours because the chart otherwise picks them from a
 * rotating set every time it is given data — so an uncoloured row changes
 * colour on every edit.
 */
export const TEAM_COLORS = [
  "#297373",
  "#e9724c",
  "#5b7db1",
  "#c05299",
  "#8a9b0f",
  "#d1495b",
  "#4f6d7a",
  "#e8a628",
] as const;

/** The colour for the nth team, cycling once the palette runs out. */
export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}
