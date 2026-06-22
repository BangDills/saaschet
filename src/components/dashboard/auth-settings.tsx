"use client";

import * as React from "react";
import {
  Check,
  GitFork,
  Key,
  Loader2,
  LogOut,
  Mail,
  Shield,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  email: string;
  fullName: string;
  githubUsername: string | null;
  provider: string;
  lastSignIn: string | null;
  createdAt: string;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuthSettings({
  email,
  fullName,
  githubUsername,
  provider,
  lastSignIn,
  createdAt,
}: Props) {
  // ── Update display name ──
  const [name, setName] = React.useState(fullName);
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameSuccess, setNameSuccess] = React.useState(false);

  async function handleNameSave() {
    if (!name.trim() || nameSaving) return;
    setNameSaving(true);
    setNameSuccess(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim() }),
      });
      if (res.ok) {
        setNameSuccess(true);
        setTimeout(() => setNameSuccess(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setNameSaving(false);
    }
  }

  // ── Change password ──
  const [oldPw, setOldPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [pwLoading, setPwLoading] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── GitHub Disconnect ──
  const [githubDisconnectLoading, setGithubDisconnectLoading] = React.useState(false);

  async function handleGithubDisconnect() {
    if (githubDisconnectLoading) return;
    setGithubDisconnectLoading(true);
    try {
      const res = await fetch("/api/github/disconnect", { method: "POST" });
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Failed to disconnect GitHub account.");
      }
    } catch {
      alert("Network error. Failed to disconnect GitHub.");
    } finally {
      setGithubDisconnectLoading(false);
    }
  }

  async function handlePasswordChange() {
    if (!newPw || newPw.length < 6) {
      setPwMsg({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPw }),
      });
      if (res.ok) {
        setPwMsg({ type: "success", text: "Password updated successfully." });
        setOldPw("");
        setNewPw("");
      } else {
        const data = await res.json().catch(() => ({}));
        setPwMsg({
          type: "error",
          text: (data as { error?: string }).error ?? "Failed to update password.",
        });
      }
    } catch {
      setPwMsg({ type: "error", text: "Network error." });
    } finally {
      setPwLoading(false);
    }
  }

  // ── Sign out ──
  async function handleSignOut() {
    try {
      const { signOut } = await import("@/app/(auth)/login/actions");
      await signOut();
    } catch {
      // redirect will throw; that's expected
    }
  }

  const providerLabel =
    provider === "github"
      ? "GitHub"
      : provider === "google"
        ? "Google"
        : "Email & Password";

  return (
    <div className="space-y-6">
      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="size-5" />
            Account Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                {email}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Auth Provider
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                {provider === "github" ? (
                  <GitFork className="size-4 text-muted-foreground" />
                ) : (
                  <Key className="size-4 text-muted-foreground" />
                )}
                {providerLabel}
              </p>
            </div>
            {githubUsername ? (
              <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Connected GitHub Account
                </p>
                <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <GitFork className="size-4 text-muted-foreground" />
                    <span>@{githubUsername}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGithubDisconnect}
                    disabled={githubDisconnectLoading}
                    className="h-8 text-xs font-semibold text-red-500 border-red-200 hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-red-950 dark:hover:bg-red-950 transition-colors"
                  >
                    {githubDisconnectLoading ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : null}
                    Disconnect GitHub
                  </Button>
                </div>
              </div>
            ) : (
              <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Connected GitHub Account
                </p>
                <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-dashed border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    No GitHub account linked. Link your account to enable Agent Mode operations on private repos.
                  </span>
                  <a
                    href="/api/github/oauth"
                    className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                  >
                    Connect GitHub
                  </a>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last Sign In
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(lastSignIn)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Account Created
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(createdAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Update display name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="size-5" />
            Display Name
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <Button
              onClick={handleNameSave}
              disabled={nameSaving || !name.trim()}
            >
              {nameSaving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : nameSuccess ? (
                <Check className="mr-2 size-4" />
              ) : null}
              {nameSuccess ? "Saved" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change password (only for email provider) */}
      {provider === "email" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="size-5" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password (min 6 characters)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            {pwMsg && (
              <p
                className={
                  pwMsg.type === "success"
                    ? "text-sm text-emerald-600 dark:text-emerald-400"
                    : "text-sm text-red-600 dark:text-red-400"
                }
              >
                {pwMsg.text}
              </p>
            )}
            <Button
              onClick={handlePasswordChange}
              disabled={pwLoading || !newPw}
            >
              {pwLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Update Password
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sign out */}
      <Card>
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <p className="font-medium">Sign Out</p>
            <p className="text-sm text-muted-foreground">
              End your current session on this device.
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
