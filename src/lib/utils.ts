import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators, e.g. 46823 -> "46,823" */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Word-initials for an avatar, e.g. "Adela Parkson" -> "AP", "claude" -> "C".
 *  Single source of truth — the sidebar and the profile page previously
 *  computed initials differently and disagreed for the same user. */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
