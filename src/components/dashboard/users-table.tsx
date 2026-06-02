"use client";

import * as React from "react";
import { Crown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RealUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
  provider: string;
  tier: "free" | "pro";
  totalUsed: number;
  createdAt: string;
  lastSignIn: string | null;
};

const PAGE_SIZE = 8;

function TierBadge({ tier }: { tier: "free" | "pro" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        tier === "pro"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {tier === "pro" && <Crown className="size-2.5" />}
      {tier}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const label =
    provider === "github"
      ? "GitHub"
      : provider === "google"
        ? "Google"
        : "Email";
  return (
    <span className="text-sm text-muted-foreground">{label}</span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsersTable({ users }: { users: RealUserRow[] }) {
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const pageRows = users.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-4 py-4">
                <Checkbox
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-4">User</th>
              <th className="px-3 py-4">Provider</th>
              <th className="px-3 py-4">Plan</th>
              <th className="px-3 py-4 text-right">Credits Used</th>
              <th className="px-3 py-4">Created</th>
              <th className="px-3 py-4">Last Sign In</th>
              <th className="w-12 px-4 py-4" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const isSelected = selected.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border text-sm transition-colors last:border-0 hover:bg-muted/50",
                      isSelected && "bg-muted/40",
                    )}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select ${row.email}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {row.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.avatarUrl}
                            alt=""
                            className="size-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {(row.fullName || row.email)
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {row.fullName || row.email.split("@")[0]}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.email}
                          </p>
                          {row.githubUsername && (
                            <p className="text-[10px] text-muted-foreground">
                              @{row.githubUsername}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ProviderBadge provider={row.provider} />
                    </td>
                    <td className="px-3 py-3">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-mono text-muted-foreground">
                      {row.totalUsed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(row.lastSignIn)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        aria-label="Row actions"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {selected.size} of {users.length} row(s) selected.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Checkbox({
  checked,
  onChange,
  ...props
}: {
  checked: boolean;
  onChange: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked">) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="size-4 cursor-pointer rounded border-border accent-primary"
      {...props}
    />
  );
}
