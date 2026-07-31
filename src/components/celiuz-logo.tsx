import { cn } from "@/lib/utils";

type CeliuzLogoProps = {
  className?: string;
  decorative?: boolean;
};

/**
 * The Celiuz monogram — three concentric "C" rings — drawn as inline SVG.
 * Being code (not an image file) it can't break in a build, inherits
 * `currentColor` so it adapts to light/dark themes automatically, and
 * scales cleanly at any size.
 */
export function CeliuzLogo({ className, decorative = true }: CeliuzLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Celiuz AI"}
      className={cn("inline-block size-9 shrink-0", className)}
    >
      {/* Outer C */}
      <path d="M 89.7,77.8 A 48.5,48.5 0 1 1 89.7,22.2 L 79.1,29.6 A 35.5,35.5 0 1 0 79.1,70.4 Z" />
      {/* Middle C */}
      <path d="M 76.6,68.6 A 32.5,32.5 0 1 1 76.6,31.4 L 67.6,37.7 A 21.5,21.5 0 1 0 67.6,62.3 Z" />
      {/* Inner C */}
      <path d="M 64.3,60.0 A 17.5,17.5 0 1 1 64.3,40.0 L 57.8,44.6 A 9.5,9.5 0 1 0 57.8,55.4 Z" />
    </svg>
  );
}
