export const getScheduleXPayloadDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  const dateString = typeof value === "string" ? value : String(value);
  const match = dateString.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s[])/);

  return match?.[1] ?? null;
};
