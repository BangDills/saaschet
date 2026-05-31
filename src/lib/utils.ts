import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators, e.g. 46823 -> "46,823" */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
