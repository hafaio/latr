const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

export function formatTime(epoch: number): string {
  return timeFmt.format(epoch);
}

export function formatDate(epoch: number): string {
  return dateFmt.format(epoch);
}

export function formatSnoozeTime(
  epoch: number,
  now: number = Date.now(),
): string {
  const hoursDelta = Math.abs(epoch - now) / (1000 * 60 * 60);
  if (hoursDelta < 24) return formatTime(epoch);
  return `${formatDate(epoch)} at ${formatTime(epoch)}`;
}
