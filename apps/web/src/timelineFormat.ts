export function timelineDate(value: string, language: string) {
  const numeric = /^-?\d+$/.test(value);
  const date = numeric
    ? new Date(Number(value) * 1000)
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(
        language,
        numeric ? { timeZone: "UTC" } : undefined,
      );
}

export function timelineDeadline(
  value: string,
  type: number,
  language: string,
) {
  const dates = value.split("|");
  if (type === 17 && dates.length === 2) dates.reverse();
  return dates.map((date) => timelineDate(date, language)).join(" → ");
}

export function timelineDuration(value: string) {
  const seconds = value.trim().replace(/^\|/, "");
  if (!/^-?\d+$/.test(seconds)) return null;
  const total = Math.abs(Number(seconds));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
