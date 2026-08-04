import Link from "next/link";
import { CeliuzLogo } from "@/components/celiuz-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Celiuz AI — beranda"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            <CeliuzLogo className="size-6" decorative={false} />
            Celiuz AI
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
