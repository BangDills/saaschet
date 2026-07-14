import { cn } from "@/lib/utils";

type CeliuzLogoProps = {
  className?: string;
  letterClassName?: string;
  decorative?: boolean;
};

export function CeliuzLogo({
  className,
  letterClassName,
  decorative = true,
}: CeliuzLogoProps) {
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Celiuz"}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-logo text-logo-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "font-sans text-xl font-extrabold leading-none tracking-[-0.08em]",
          letterClassName,
        )}
      >
        C
      </span>
    </span>
  );
}
