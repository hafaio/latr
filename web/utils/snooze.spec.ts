import { describe, expect, test } from "bun:test";
import { getSnoozeOptions, type SnoozeKind } from "./snooze";

function kinds(now: Date): SnoozeKind[] {
  return getSnoozeOptions(now).map((o) => o.kind);
}

describe("getSnoozeOptions", () => {
  test("InALittleWhile and Custom are always present", () => {
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
      for (const hour of [6, 10, 21]) {
        const d = new Date(2026, 3, 6 + dow, hour);
        const ks = kinds(d);
        expect(ks).toContain("InALittleWhile");
        expect(ks[ks.length - 1]).toBe("Custom");
      }
    }
  });

  test("ThisMorning is only shown before the morning threshold", () => {
    const before = new Date(2026, 3, 15, 6); // Wed 06:00
    const after = new Date(2026, 3, 15, 10); // Wed 10:00
    expect(kinds(before)).toContain("ThisMorning");
    expect(kinds(after)).not.toContain("ThisMorning");
  });

  test("LaterToday is shown before evening, Tomorrow after morning", () => {
    const midday = new Date(2026, 3, 15, 14); // Wed 14:00
    const latenight = new Date(2026, 3, 15, 22); // Wed 22:00
    expect(kinds(midday)).toContain("LaterToday");
    expect(kinds(midday)).toContain("Tomorrow");
    expect(kinds(latenight)).not.toContain("LaterToday");
    expect(kinds(latenight)).toContain("LaterTomorrow");
  });

  test("weekends never offer NextMonday", () => {
    // 2026-04-11 is a Saturday, 2026-04-12 is a Sunday.
    expect(kinds(new Date(2026, 3, 11, 10))).not.toContain("NextMonday");
    expect(kinds(new Date(2026, 3, 12, 10))).not.toContain("NextMonday");
  });

  test("weekdays always offer NextMonday", () => {
    // Mon through Fri (2026-04-13..17).
    for (let day = 13; day <= 17; day++) {
      expect(kinds(new Date(2026, 3, day, 10))).toContain("NextMonday");
    }
  });

  test("Friday-afternoon swaps ThisSaturday for ThisSunday (since Tomorrow = Sat)", () => {
    const fridayAfternoon = new Date(2026, 3, 17, 14); // Fri 14:00
    const ks = kinds(fridayAfternoon);
    expect(ks).toContain("Tomorrow");
    expect(ks).toContain("ThisSunday");
    expect(ks).not.toContain("ThisSaturday");
  });

  test("Sunday-afternoon swaps ThisMonday for ThisTuesday", () => {
    const sundayAfternoon = new Date(2026, 3, 12, 14); // Sun 14:00
    const ks = kinds(sundayAfternoon);
    expect(ks).toContain("Tomorrow");
    expect(ks).toContain("ThisTuesday");
    expect(ks).not.toContain("ThisMonday");
  });

  test("Last is appended only when lastCustomMillis is given", () => {
    const now = new Date(2026, 3, 15, 10);
    expect(kinds(now)).not.toContain("Last");
    const withLast = getSnoozeOptions(now, { lastCustomMillis: 42 });
    expect(withLast.map((o) => o.kind)).toContain("Last");
  });

  test("named-day options never collide with Tomorrow on the same date", () => {
    const namedDays: SnoozeKind[] = [
      "ThisSaturday",
      "ThisSunday",
      "ThisMonday",
      "ThisTuesday",
      "NextMonday",
      "NextSaturday",
    ];
    for (const day of [11, 12, 13, 14, 15, 16, 17]) {
      for (const hour of [6, 10, 21]) {
        const now = new Date(2026, 3, day, hour);
        const options = getSnoozeOptions(now);
        const tomorrow = options.find((o) => o.kind === "Tomorrow");
        if (!tomorrow) continue;
        const tomorrowDay = new Date(tomorrow.epochMillis).toDateString();
        for (const o of options) {
          if (!namedDays.includes(o.kind)) continue;
          expect(new Date(o.epochMillis).toDateString()).not.toBe(tomorrowDay);
        }
      }
    }
  });
});
