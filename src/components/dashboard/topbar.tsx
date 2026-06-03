"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";

function useCurrentTitle() {
  const pathname = usePathname();
  const match =
    navItems.find((i) =>
      i.href === "/" ? pathname === "/" : pathname.startsWith(i.href),
    ) ?? navItems[0];
  return match.label;
}

export type TopbarProps = {
  initials: string;
};

export function Topbar({ initials }: TopbarProps) {
  const title = useCurrentTitle();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 bg-background">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <div className="hidden sm:inline-flex">
            <SignOutButton />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "U"}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                href="/"
                className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
              >
                SaaSchet AI Studio
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <nav className="flex flex-col gap-0.5 px-3 py-2">
              {navItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-sidebar-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
