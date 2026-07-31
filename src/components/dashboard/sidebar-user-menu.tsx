"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Check,
  ChevronRight,
  CreditCard,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User,
} from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

export type SidebarUserMenuProps = {
  displayName: string;
  initials: string;
  email: string;
  avatarUrl: string | null;
};

/**
 * The bottom-of-sidebar account control — Hyperagent-style. Tapping the
 * avatar/name row opens a popup menu (account header, profile, billing,
 * theme switcher, logout) instead of a bare sign-out button.
 */
export function SidebarUserMenu({
  displayName,
  initials,
  email,
  avatarUrl,
}: SidebarUserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative border-t border-sidebar-border">
      {/* Popup menu — opens upward from the bottom of the sidebar. */}
      {open && (
        <div className="absolute bottom-full left-2 right-2 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          {/* Account header */}
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {email && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>

          <nav className="flex flex-col p-1.5">
            <MenuLink
              href="/profile"
              icon={<User className="size-4" />}
              label="Profil"
              onNavigate={() => setOpen(false)}
            />
            <MenuLink
              href="/subscription"
              icon={<CreditCard className="size-4" />}
              label="Langganan"
              onNavigate={() => setOpen(false)}
            />
          </nav>

          {/* Theme switcher */}
          <div className="border-t border-border p-1.5">
            <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tema
            </p>
            <div className="grid grid-cols-3 gap-1">
              <ThemeButton
                active={theme === "light"}
                onClick={() => setTheme("light")}
                icon={<Sun className="size-4" />}
                label="Terang"
              />
              <ThemeButton
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                icon={<Moon className="size-4" />}
                label="Gelap"
              />
              <ThemeButton
                active={theme === "system"}
                onClick={() => setTheme("system")}
                icon={<Monitor className="size-4" />}
                label="Sistem"
              />
            </div>
          </div>

          {/* Logout */}
          <div className="border-t border-border p-1.5">
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Keluar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Trigger row — avatar + name + chevron. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "U"}
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{displayName}</p>
          {email && (
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          )}
        </div>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "-rotate-90",
          )}
        />
      </button>
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors hover:bg-accent"
    >
      {icon}
      {label}
    </Link>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-1">
        {active && <Check className="size-3" />}
        {icon}
      </span>
      {label}
    </button>
  );
}
