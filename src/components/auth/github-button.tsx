import Link from "next/link";
import { cn } from "@/lib/utils";

export type GitHubButtonProps = {
  className?: string;
};

/** Inline GitHub mark — `lucide-react` v1 doesn't ship the icon. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="currentColor"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.96c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.39.97.01 1.95.14 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.15v3.18c0 .31.21.66.8.55C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/**
 * "Continue with GitHub" button used on /login and /signup. Hits a route
 * handler at /auth/login/github which kicks off the Supabase OAuth flow.
 */
export function GitHubButton({ className }: GitHubButtonProps) {
  return (
    <Link
      href="/auth/login/github"
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-lg",
        "border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm",
        "transition-colors hover:bg-accent",
        className,
      )}
    >
      <GitHubMark className="size-4" />
      Continue with GitHub
    </Link>
  );
}
