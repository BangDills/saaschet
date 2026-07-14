"use client";

import * as React from "react";
import { Crown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateUserTierAction, deleteUserAction } from "@/app/(dashboard)/users/actions";

export type RealUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
  provider: string;
  tier: "free" | "pro";
  tierExpiresAt: string | null;
  tierExpired: boolean;
  totalUsed: number;
  createdAt: string;
  lastSignIn: string | null;
};

const PAGE_SIZE = 8;

function TierBadge({
  tier,
  tierExpiresAt,
  expired,
}: {
  tier: "free" | "pro";
  tierExpiresAt: string | null;
  expired: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        tier === "pro" && !expired
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {tier === "pro" && <Crown className="size-2.5" />}
      {expired ? "pro·expired" : tier}
      {tier === "pro" && tierExpiresAt && !expired && (
        <span className="font-normal normal-case opacity-70">
          · until {new Date(tierExpiresAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
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
  const [activeMenuUserId, setActiveMenuUserId] = React.useState<string | null>(null);
  const [loadingUserId, setLoadingUserId] = React.useState<string | null>(null);
  const [batchLoading, setBatchLoading] = React.useState(false);

  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  // Clamp page in render so shrinking data never points past the last page
  // (avoids a setState-in-effect).
  const safePage = totalPages > 0 ? Math.min(page, totalPages - 1) : 0;
  const pageRows = users.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  // Click outside listener to close row action menu
  React.useEffect(() => {
    if (!activeMenuUserId) return;
    function handleOutsideClick() {
      setActiveMenuUserId(null);
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [activeMenuUserId]);

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

  async function handleToggleTier(userId: string, currentTier: "free" | "pro") {
    try {
      setLoadingUserId(userId);
      const nextTier = currentTier === "pro" ? "free" : "pro";
      await updateUserTierAction(userId, nextTier);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user tier");
    } finally {
      setLoadingUserId(null);
      setActiveMenuUserId(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!window.confirm("Are you sure you want to delete this user? All their data (chats, profiles, credits) will be permanently deleted.")) {
      return;
    }
    try {
      setLoadingUserId(userId);
      await deleteUserAction(userId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setLoadingUserId(null);
      setActiveMenuUserId(null);
    }
  }

  async function handleBatchUpgrade() {
    if (selected.size === 0) return;
    try {
      setBatchLoading(true);
      for (const id of Array.from(selected)) {
        await updateUserTierAction(id, "pro");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upgrade users");
    } finally {
      setBatchLoading(false);
      setSelected(new Set());
    }
  }

  async function handleBatchDowngrade() {
    if (selected.size === 0) return;
    try {
      setBatchLoading(true);
      for (const id of Array.from(selected)) {
        await updateUserTierAction(id, "free");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to downgrade users");
    } finally {
      setBatchLoading(false);
      setSelected(new Set());
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete all ${selected.size} selected users? All their data will be permanently deleted.`)) {
      return;
    }
    try {
      setBatchLoading(true);
      for (const id of Array.from(selected)) {
        await deleteUserAction(id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete users");
    } finally {
      setBatchLoading(false);
      setSelected(new Set());
    }
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {selected.size}
            </span>
            <span>user(s) selected</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={batchLoading}
              onClick={handleBatchUpgrade}
            >
              Make Pro 24h
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={batchLoading}
              onClick={handleBatchDowngrade}
            >
              Make Free
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              size="sm"
              disabled={batchLoading}
              onClick={handleBatchDelete}
            >
              {batchLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Delete Selected"
              )}
            </Button>
          </div>
        </div>
      )}

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
                        <TierBadge
                          tier={row.tier}
                          tierExpiresAt={row.tierExpiresAt}
                          expired={row.tierExpired}
                        />
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
                      <td className="relative px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuUserId(activeMenuUserId === row.id ? null : row.id);
                          }}
                          disabled={loadingUserId !== null}
                          aria-label="Row actions"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                        >
                          {loadingUserId === row.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          ) : (
                            <MoreHorizontal className="size-4" />
                          )}
                        </button>
                        
                        {activeMenuUserId === row.id && (
                          <div className="absolute right-4 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                            <button
                              onClick={() => handleToggleTier(row.id, row.tier)}
                              className="flex w-full items-center px-2.5 py-1.5 text-left text-xs font-medium rounded-md hover:bg-accent text-foreground transition-colors"
                            >
                              {row.tier === "pro" ? "Make Free" : "Aktifkan Pro 24h"}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(row.id)}
                              className="flex w-full items-center px-2.5 py-1.5 text-left text-xs font-medium rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              Delete User
                            </button>
                          </div>
                        )}
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
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
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
