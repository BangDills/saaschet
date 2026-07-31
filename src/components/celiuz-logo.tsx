import { cn } from "@/lib/utils";

type CeliuzLogoProps = {
  className?: string;
  decorative?: boolean;
};

/**
 * The Celiuz monogram (concentric "CC"). Served from /logo.png — swap that
 * one file to rebrand everywhere this component is used.
 */
export function CeliuzLogo({ className, decorative = true }: CeliuzLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt={decorative ? "" : "Celiuz AI"}
      aria-hidden={decorative || undefined}
      className={cn("inline-block size-9 shrink-0 object-contain", className)}
    />
  );
}
