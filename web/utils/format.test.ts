import { describe, expect, test } from "bun:test";
import { formatSnoozeTime } from "./format";

describe("formatSnoozeTime", () => {
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();
  const HOUR = 60 * 60 * 1000;

  test("within 24h: no date segment", () => {
    const out = formatSnoozeTime(now + 3 * HOUR, now);
    expect(out).not.toContain(" at ");
  });

  test("more than 24h in the future: date + time", () => {
    const out = formatSnoozeTime(now + 48 * HOUR, now);
    expect(out).toContain(" at ");
  });

  test("more than 24h in the past also gets the date segment", () => {
    // abs(delta) guards against snooze times that have already slipped far
    // behind now — they should still show the date, not just a bare time.
    const out = formatSnoozeTime(now - 48 * HOUR, now);
    expect(out).toContain(" at ");
  });
});
