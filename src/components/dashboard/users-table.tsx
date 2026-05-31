"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { users as allUsers, type UserRow } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 4;

function ProviderBadge({ provider }: { provider: UserRow["provider"] }) {
  return (
    <span className="text-sm text-muted-foreground">{provider}</span>
  );
}

export function UsersTable() {
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE);
  const pageRows = allUsers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

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
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-6 py-4">
                <Checkbox
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 py-4">Email Address</th>
              <th className="px-2 py-4">Provider</th>
              <th className="px-2 py-4">Created</th>
              <th className="px-2 py-4">Last Sign In</th>
              <th className="px-2 py-4">User UID</th>
              <th className="w-12 px-6 py-4" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border text-sm transition-colors last:border-0 hover:bg-muted/50",
                    isSelected && "bg-muted/40",
                  )}
                >
                  <td className="px-6 py-4">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.email}`}
                    />
                  </td>
                  <td className="px-2 py-4 font-medium">{row.email}</td>
                  <td className="px-2 py-4">
                    <ProviderBadge provider={row.provider} />
                  </td>
                  <td className="px-2 py-4 text-muted-foreground">
                    {row.created}
                  </td>
                  <td className="px-2 py-4 text-muted-foreground">
                    {row.lastSignIn}
                  </td>
                  <td className="px-2 py-4 font-mono text-xs text-muted-foreground">
                    {row.uid.slice(0, 18)}…
                  </td>
                  <td className="px-6 py-4">
                    <button
                      aria-label="Row actions"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
        <p className="text-sm text-muted-foreground">
          {selected.size} of {allUsers.length} row(s) selected.
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
