"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { getNavItems, type UserRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreditsMeter } from "./credits-meter";

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
    <aside className="hidden h-screen w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-5 lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Zap className="size-5 fill-current" />
        </div>
        <span className="text-xl font-bold tracking-tight">Horizon AI</span>
      </div>

      <div className="mb-2 border-t border-sidebar-border" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-2">
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
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-2">
        <CreditsMeter />
      </div>

      {/* Real user info */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-sidebar-border bg-card p-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials || "U"}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {email && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
