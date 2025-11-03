export function formatDateTime(date: string | Date | null) {
  if (!date) return "-";

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    hour12: true,
  });

  return formatter.format(new Date(date));
}
