"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Award, LogOut } from "lucide-react";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

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

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-2">
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

      {/* PRO member card */}
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-sidebar-border bg-card p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Award className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">PRO Member</p>
          <p className="text-xs text-muted-foreground">Unlimited plan active</p>
        </div>
      </div>

      {/* User */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-sidebar-border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            AP
          </div>
          <span className="text-sm font-medium">Adela Parkson</span>
        </div>
        <button
          aria-label="Sign out"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
