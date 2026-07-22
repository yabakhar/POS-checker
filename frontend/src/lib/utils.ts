import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `d.toISOString().slice(0, 10)` reads off the UTC calendar date, not the viewer's —
// around local midnight that's the wrong day (e.g. "Aujourd'hui" showing yesterday
// for the first hour after midnight in timezones ahead of UTC). Use the local date
// parts instead so "today" always matches the viewer's actual calendar day.
export function toLocalISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
