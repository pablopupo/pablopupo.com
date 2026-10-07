// Performance dates are calendar dates, independent of the viewer's timezone.
export function performanceDateInput(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

export function performanceDateValue(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date.toISOString() : null;
}
