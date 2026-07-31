import { readFile } from "fs/promises";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { CeliuzLogo } from "@/components/celiuz-logo";

/**
 * Shared legal-document page (Privacy Policy / Terms of Service).
 *
 * Reads the canonical markdown from the repo root so the web page and the
 * repository copy can never drift apart — PRIVACY.md / TERMS.md are the
 * single source of truth for both.
 */
export async function LegalDoc({
  file,
  title,
}: {
  file: "PRIVACY.md" | "TERMS.md";
  title: string;
}) {
  const filePath = path.join(process.cwd(), file);
  let markdown: string;
  try {
    markdown = await readFile(filePath, "utf-8");
  } catch {
    markdown = `# ${title}\n\nThe ${title} document is not available yet.`;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <CeliuzLogo className="size-6" />
            <span>Celiuz AI</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-border px-2.5 py-1 text-foreground transition-colors hover:bg-muted"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <article className="legal-doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Celiuz AI</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
