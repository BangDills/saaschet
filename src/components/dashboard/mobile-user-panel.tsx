"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User,
} from "lucide-react";
import { CreditsMeter } from "./credits-meter";
import { signOut } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

export type MobileUserPanelProps = {
  displayName: string;
  initials: string;
  email: string;
  avatarUrl: string | null;
};

/**
 * Mobile-drawer account control — the Hyperagent pattern. A profile row
 * (avatar + name + email) pinned to the bottom of the drawer; tapping it
 * slides in a second panel (Account) with profile/billing links, a theme
 * switcher, and logout. The back arrow returns to the main drawer.
 */
export function MobileUserPanel({
  displayName,
  initials,
  email,
  avatarUrl,
}: MobileUserPanelProps) {
  const [open, setOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <>
      {/* Trigger: profile row at the bottom of the drawer. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 border-t border-sidebar-border px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "U"}
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{displayName}</p>
          {email && (
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Slide-in account panel — replaces the drawer content like Hyperagent. */}
      {open && (
        <div className="absolute inset-0 z-10 flex flex-col bg-sidebar">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Kembali"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
            <p className="text-sm font-semibold">Account</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Identity header */}
            <div className="px-4 pb-2 pt-4">
              <p className="truncate text-base font-semibold">{displayName}</p>
              {email && (
                <p className="truncate text-sm text-muted-foreground">{email}</p>
              )}
            </div>

            {/* Credits/quota — lives here with the account, like Hyperagent's
                "Pay As You Go" block, not as a separate drawer card. */}
            <div className="px-3 pb-2">
              <CreditsMeter />
            </div>

            <nav className="flex flex-col gap-0.5 px-3 py-2">
              <PanelLink
                href="/profile"
                icon={<User className="size-4" />}
                label="Profil"
              />
              <PanelLink
                href="/subscription"
                icon={<CreditCard className="size-4" />}
                label="Langganan"
              />
            </nav>

            {/* Theme switcher */}
            <div className="px-3 py-2">
              <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tema
              </p>
              <div className="grid grid-cols-3 gap-1.5">
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
          </div>

          {/* Logout pinned to the bottom */}
          <div className="border-t border-sidebar-border p-3">
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Keluar
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function PanelLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
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
      {icon}
      {label}
    </button>
  );
}
