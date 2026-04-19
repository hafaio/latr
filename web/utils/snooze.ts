export type SnoozeKind =
  | "InALittleWhile"
  | "ThisMorning"
  | "LaterToday"
  | "Tomorrow"
  | "LaterTomorrow"
  | "ThisSaturday"
  | "ThisSunday"
  | "ThisMonday"
  | "ThisTuesday"
  | "NextSaturday"
  | "NextMonday"
  | "Last"
  | "Custom";

export type SnoozeOption = {
  kind: SnoozeKind;
  label: string;
  epochMillis: number;
};

type Prefs = {
  morningMinutes?: number;
  eveningMinutes?: number;
  lastCustomMillis?: number | null;
};

const SUN = 0;
const MON = 1;
const TUE = 2;
const FRI = 5;
const SAT = 6;

function setTime(d: Date, hour: number, minute: number): Date {
  const out = new Date(d);
  out.setHours(hour, minute, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function nextDayOfWeek(from: Date, targetDow: number): Date {
  const cur = from.getDay();
  let delta = (targetDow - cur + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}

export function getSnoozeOptions(now: Date, prefs: Prefs = {}): SnoozeOption[] {
  const morningMinutes = prefs.morningMinutes ?? 480;
  const eveningMinutes = prefs.eveningMinutes ?? 1200;
  const morningHour = Math.floor(morningMinutes / 60);
  const morningMinute = morningMinutes % 60;
  const eveningHour = Math.floor(eveningMinutes / 60);
  const eveningMinute = eveningMinutes % 60;

  const atMorning = (d: Date) =>
    setTime(d, morningHour, morningMinute).getTime();
  const atEvening = (d: Date) =>
    setTime(d, eveningHour, eveningMinute).getTime();

  const hour = now.getHours();
  const dow = now.getDay();
  const isWeekend = dow === SAT || dow === SUN;
  const options: SnoozeOption[] = [];

  options.push({
    kind: "InALittleWhile",
    label: "In a little while",
    epochMillis: now.getTime() + 3 * 60 * 60 * 1000,
  });

  if (hour < morningHour) {
    options.push({
      kind: "ThisMorning",
      label: "This morning",
      epochMillis: atMorning(now),
    });
  }

  if (hour < eveningHour) {
    options.push({
      kind: "LaterToday",
      label: "Later today",
      epochMillis: atEvening(now),
    });
  }

  if (hour >= morningHour) {
    options.push({
      kind: "Tomorrow",
      label: "Tomorrow",
      epochMillis: atMorning(addDays(now, 1)),
    });
  }

  if (hour >= eveningHour) {
    options.push({
      kind: "LaterTomorrow",
      label: "Later tomorrow",
      epochMillis: atEvening(addDays(now, 1)),
    });
  }

  const isFridayAfterMorning = dow === FRI && hour >= morningHour;
  if (!isWeekend && !isFridayAfterMorning) {
    options.push({
      kind: "ThisSaturday",
      label: "This Saturday",
      epochMillis: atMorning(nextDayOfWeek(now, SAT)),
    });
  } else if (isFridayAfterMorning) {
    options.push({
      kind: "ThisSunday",
      label: "This Sunday",
      epochMillis: atMorning(nextDayOfWeek(now, SUN)),
    });
  } else if (dow === SAT || (dow === SUN && hour < morningHour)) {
    options.push({
      kind: "ThisMonday",
      label: "This Monday",
      epochMillis: atMorning(nextDayOfWeek(now, MON)),
    });
  } else if (dow === SUN && hour >= morningHour) {
    options.push({
      kind: "ThisTuesday",
      label: "This Tuesday",
      epochMillis: atMorning(nextDayOfWeek(now, TUE)),
    });
  }

  if (isWeekend) {
    const base = dow === SAT ? addDays(now, 7) : nextDayOfWeek(now, SAT);
    options.push({
      kind: "NextSaturday",
      label: "Next Saturday",
      epochMillis: atMorning(base),
    });
  } else {
    options.push({
      kind: "NextMonday",
      label: "Next Monday",
      epochMillis: atMorning(nextDayOfWeek(now, MON)),
    });
  }

  if (prefs.lastCustomMillis) {
    options.push({
      kind: "Last",
      label: "Last",
      epochMillis: prefs.lastCustomMillis,
    });
  }

  options.push({ kind: "Custom", label: "Custom", epochMillis: 0 });

  return options;
}
