"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navItems, profileMenuItems, getNavItems, type UserRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CeliuzLogo } from "@/components/celiuz-logo";
import { ProjectsList } from "./projects-list";
import { RecentChats } from "./recent-chats";
import { MobileUserPanel } from "./mobile-user-panel";

function useCurrentTitle() {
  const pathname = usePathname();
  // Search BOTH nav groups — /profile, /subscription and /auth live in the
  // profile menu. The old fallback to navItems[0] labeled every one of those
  // pages "Admin Dashboard", even for regular users.
  const match = [...navItems, ...profileMenuItems].find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href),
  );
  return match?.label ?? "Celiuz AI";
}

export type TopbarProps = {
  initials: string;
  role?: UserRole;
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
};

export function Topbar({
  initials,
  role = "user",
  displayName = "Member",
  email = "",
  avatarUrl = null,
}: TopbarProps) {
  const title = useCurrentTitle();
  const pathname = usePathname();
  const isChatPage = pathname.startsWith("/ai-chat");
  const [open, setOpen] = React.useState(false);
  
  const items = getNavItems(role);

  // Close menus on route change — legitimate sync with router state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    function openMobileMenu() {
      setOpen(true);
    }

    window.addEventListener("celiuz:open-mobile-menu", openMobileMenu);
    return () => window.removeEventListener("celiuz:open-mobile-menu", openMobileMenu);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-background lg:bg-background">
      <div
        className={cn(
          "flex h-14 items-center justify-between gap-3 px-3 sm:h-auto sm:px-6 sm:py-3 lg:px-8",
          isChatPage &&
            "pointer-events-none absolute right-3 top-2 h-9 p-0 sm:h-9 sm:p-0 lg:pointer-events-auto lg:static lg:h-auto lg:px-8 lg:py-3",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2.5",
            isChatPage && "hidden lg:flex",
          )}
        >
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

        <div
          className={cn(
            "flex items-center gap-1.5",
            isChatPage && "pointer-events-auto",
          )}
        >
          {/* Theme toggle + avatar moved into the mobile drawer's Account
              panel — the topbar right side stays clean. */}
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-75 flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                href="/ai-chat"
                className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
                aria-label="Celiuz AI"
              >
                <CeliuzLogo className="size-8" />
                <span>Celiuz AI</span>
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
            <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
              <div className="flex flex-col gap-0.5">
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
              </div>

              <RecentChats />
            </nav>
            <div className="border-t border-sidebar-border px-1 pb-1 pt-1">
              <Suspense fallback={null}>
                <ProjectsList />
              </Suspense>
            </div>
            {/* Account control at the very bottom — profile row that opens
                the slide-in Account panel (Hyperagent pattern). The credit
                meter lives inside that panel, not as a separate drawer card. */}
            <MobileUserPanel
              displayName={displayName}
              initials={initials}
              email={email}
              avatarUrl={avatarUrl}
            />
          </div>
        </div>
      )}
    </header>
  );
}
