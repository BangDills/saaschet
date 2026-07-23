"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { getNavItems, type UserRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreditsMeter } from "./credits-meter";
import { CeliuzLogo } from "@/components/celiuz-logo";
import { ProjectsList } from "./projects-list";

export type SidebarProps = {
  displayName: string;
  initials: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
};

export function Sidebar({
  displayName,
  initials,
  email,
  avatarUrl,
  role,
}: SidebarProps) {
  const pathname = usePathname();
  const items = getNavItems(role);

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      {/* Brand */}
      <div className="px-5 py-4">
        <Link
          href="/ai-chat"
          className="group flex items-center gap-3 text-base font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          aria-label="Celiuz AI Studio"
        >
          <CeliuzLogo />
          <span>Celiuz AI Studio</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
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
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-sidebar-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-1 pb-1 pt-1">
        <Suspense fallback={null}>
          <ProjectsList />
        </Suspense>
      </div>

      <div className="px-3 pb-2">
        <CreditsMeter />
      </div>

      {/* User info */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
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
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium">{displayName}</p>
              {email && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {email}
                </p>
              )}
            </div>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
