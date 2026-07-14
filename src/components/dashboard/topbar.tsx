"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { navItems, profileMenuItems, getNavItems, type UserRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { signOut } from "@/app/(auth)/login/actions";

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
  role?: UserRole;
};

export function Topbar({ initials, role = "user" }: TopbarProps) {
  const title = useCurrentTitle();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);
  
  const items = getNavItems(role);

  // Close menus on route change — legitimate sync with router state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setOpen(false), [pathname]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setProfileOpen(false), [pathname]);

  // Close profile dropdown on outside click
  React.useEffect(() => {
    if (!profileOpen) return;
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm lg:bg-background">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:h-auto sm:px-6 sm:py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-lg lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {/* Profile avatar dropdown */}
          <div
            ref={profileRef}
            className="relative"
            onMouseEnter={() => setProfileOpen(true)}
            onMouseLeave={() => setProfileOpen(false)}
          >
            <button
              onClick={() => setProfileOpen((p) => !p)}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-80 sm:size-8"
              aria-label="Profile menu"
            >
              {initials || "U"}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg">
                <div className="p-1.5">
                  {profileMenuItems.map((item) => {
                    const active = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="size-4" />
                        {item.label}
                      </Link>
                    );
                  })}

                  <div className="my-1 border-t border-border" />

                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                href="/ai-chat"
                className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
              >
                Celiuz AI Studio
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
              {items.map((item) => {
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
