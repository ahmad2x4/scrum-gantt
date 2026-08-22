import { describe, it, expect } from "vitest";
import { teamColor, TEAM_COLORS } from "./palette";

describe("teamColor", () => {
  it("gives each team its own colour until the palette runs out", () => {
    const seen = TEAM_COLORS.map((_, i) => teamColor(i));
    expect(new Set(seen).size).toBe(TEAM_COLORS.length);
  });

  it("cycles rather than running out", () => {
    expect(teamColor(TEAM_COLORS.length)).toBe(teamColor(0));
  });

  it("is stable for the same index", () => {
    expect(teamColor(3)).toBe(teamColor(3));
  });

  it("emits hex strings, never am5.Color, so they survive JSON", () => {
    for (const c of TEAM_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
