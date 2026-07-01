export function startOfWeek(day: Date) {
  const copy = new Date(day);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return toDateInputValue(copy);
}

export function addDays(dateValue: string, offset: number) {
  const date = parseDate(dateValue);
  date.setDate(date.getDate() + offset);
  return toDateInputValue(date);
}

export function parseDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateString() {
  return toDateInputValue(new Date());
}

export function daysBetween(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}
