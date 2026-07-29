"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  GitBranch,
  Loader2,
  LogOut,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";

/**
 * The account page. Everything a member needs to manage about themselves —
 * identity, password, plan, connections — in one place, so there is exactly
 * one screen to look at (and one place to change a password).
 */

type Props = {
  email: string;
  fullName: string;
  avatarUrl: string | null;
  githubUsername: string | null;
  /** Supabase auth provider — "email" accounts are the only ones with a password. */
  provider: string;
  memberSince: string | null;
  tier: "free" | "pro";
  usedToday: number;
  dailyLimit: number;
};

type Status = { type: "success" | "error"; text: string } | null;

const MIN_PASSWORD_LENGTH = 8;

/** Links styled as buttons — Button renders a <button> and has no asChild. */
const linkButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Shared input styling — the repo has no Input primitive yet. */
const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={cn(
        "text-sm",
        status.type === "success" ? "text-foreground" : "text-destructive",
      )}
    >
      {status.text}
    </p>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputClass, "pr-10")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function ProfileSettings({
  email,
  fullName,
  avatarUrl,
  githubUsername,
  provider,
  memberSince,
  tier,
  usedToday,
  dailyLimit,
}: Props) {
  const displayName = fullName.trim() || email.split("@")[0];

  // ── Display name ────────────────────────────────────────────────────────
  const [name, setName] = React.useState(fullName);
  const [savedName, setSavedName] = React.useState(fullName);
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameStatus, setNameStatus] = React.useState<Status>(null);
  const nameDirty = name.trim() !== savedName.trim() && name.trim().length > 0;

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (!nameDirty || nameSaving) return;
    setNameSaving(true);
    setNameStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setSavedName(name.trim());
        setNameStatus({ type: "success", text: "Nama tersimpan." });
        setTimeout(() => setNameStatus(null), 2500);
      } else {
        setNameStatus({ type: "error", text: data.error ?? "Gagal menyimpan nama." });
      }
    } catch {
      setNameStatus({ type: "error", text: "Jaringan bermasalah. Coba lagi." });
    } finally {
      setNameSaving(false);
    }
  }

  // ── Password ────────────────────────────────────────────────────────────
  const canChangePassword = provider === "email";
  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [pwSaving, setPwSaving] = React.useState(false);
  const [pwStatus, setPwStatus] = React.useState<Status>(null);

  // Local checks mirror the server's, so the user gets the answer without a
  // round trip. The server re-validates everything — this is UX, not a gate.
  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const tooShort = newPw.length > 0 && newPw.length < MIN_PASSWORD_LENGTH;
  const sameAsOld = newPw.length > 0 && newPw === currentPw;
  const pwReady =
    currentPw.length > 0 &&
    newPw.length >= MIN_PASSWORD_LENGTH &&
    newPw === confirmPw &&
    !sameAsOld;

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!pwReady || pwSaving) return;
    setPwSaving(true);
    setPwStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, password: newPw }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
        setPwStatus({ type: "success", text: "Password berhasil diganti." });
      } else {
        setPwStatus({
          type: "error",
          text: data.error ?? "Gagal mengganti password.",
        });
      }
    } catch {
      setPwStatus({ type: "error", text: "Jaringan bermasalah. Coba lagi." });
    } finally {
      setPwSaving(false);
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = React.useState(false);
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { signOut } = await import("@/app/(auth)/login/actions");
      await signOut();
    } catch {
      // signOut redirects, which throws — expected.
    }
  }

  const remaining = Math.max(0, dailyLimit - usedToday);
  const usedPct = dailyLimit > 0 ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* ── Account ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // Avatar URLs come from external identity providers, so their
              // dimensions and host are not known ahead of time.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
                {getInitials(displayName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{savedName.trim() || displayName}</p>
              {memberSince && (
                <p className="text-xs text-muted-foreground">
                  Bergabung sejak {memberSince}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={saveName} className="space-y-4">
            <Field label="Nama" htmlFor="profile-name">
              <input
                id="profile-name"
                value={name}
                maxLength={60}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Email"
              htmlFor="profile-email"
              hint="Email tidak bisa diubah dari sini — hubungi admin jika perlu."
            >
              <input
                id="profile-email"
                value={email}
                readOnly
                disabled
                className={cn(inputClass, "cursor-not-allowed text-muted-foreground")}
              />
            </Field>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!nameDirty || nameSaving}>
                {nameSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Simpan perubahan
              </Button>
              <StatusLine status={nameStatus} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Password ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Password</CardTitle>
        </CardHeader>
        <CardContent>
          {canChangePassword ? (
            <form onSubmit={changePassword} className="space-y-4">
              <Field label="Password lama" htmlFor="current-password">
                <PasswordInput
                  id="current-password"
                  value={currentPw}
                  onChange={setCurrentPw}
                  autoComplete="current-password"
                />
              </Field>

              <Field
                label="Password baru"
                htmlFor="new-password"
                hint={`Minimal ${MIN_PASSWORD_LENGTH} karakter.`}
              >
                <PasswordInput
                  id="new-password"
                  value={newPw}
                  onChange={setNewPw}
                  autoComplete="new-password"
                />
              </Field>

              <Field label="Konfirmasi password baru" htmlFor="confirm-password">
                <PasswordInput
                  id="confirm-password"
                  value={confirmPw}
                  onChange={setConfirmPw}
                  autoComplete="new-password"
                />
              </Field>

              {tooShort && (
                <p className="text-sm text-destructive">
                  Password baru minimal {MIN_PASSWORD_LENGTH} karakter.
                </p>
              )}
              {sameAsOld && (
                <p className="text-sm text-destructive">
                  Password baru harus berbeda dari password lama.
                </p>
              )}
              {mismatch && (
                <p className="text-sm text-destructive">
                  Konfirmasi password tidak cocok.
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!pwReady || pwSaving}>
                  {pwSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Ganti password
                </Button>
                <StatusLine status={pwStatus} />
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Anda masuk lewat{" "}
              <span className="font-medium text-foreground">
                {provider === "github" ? "GitHub" : provider === "google" ? "Google" : provider}
              </span>
              , jadi password diatur di penyedia tersebut — tidak ada password
              Celiuz yang perlu diganti.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Subscription ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Langganan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">
                  {tier === "pro" ? "Pro" : "Free"}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Paket aktif
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier === "pro"
                  ? "3.000 kredit per 24 jam, agent mode penuh."
                  : "50 kredit per hari. Upgrade untuk kuota dan agent run yang lebih panjang."}
              </p>
            </div>
            <Link
              href="/subscription"
              className={cn(
                linkButtonClass,
                tier === "pro"
                  ? "border border-border bg-card hover:bg-accent hover:text-accent-foreground"
                  : "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
              )}
            >
              {tier === "pro" ? "Kelola langganan" : "Upgrade ke Pro"}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Terpakai hari ini:{" "}
                <span className="font-medium text-foreground">{usedToday}</span> dari{" "}
                {dailyLimit} kredit
              </span>
              <span>Sisa {remaining}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  usedPct >= 100
                    ? "bg-destructive"
                    : usedPct >= 80
                      ? "bg-amber-500"
                      : "bg-foreground",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Connections ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <GitBranch className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">GitHub</p>
                <p className="truncate text-xs text-muted-foreground">
                  {githubUsername ? (
                    <>
                      Terhubung sebagai{" "}
                      <span className="font-mono">@{githubUsername}</span>
                    </>
                  ) : (
                    "Diperlukan agar agent bisa membaca dan menulis kode di repo Anda."
                  )}
                </p>
              </div>
            </div>
            {githubUsername ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Check className="size-3.5" />
                Terhubung
              </span>
            ) : (
              <a
                href="/api/github/oauth"
                className={cn(
                  linkButtonClass,
                  "border border-border bg-card hover:bg-accent hover:text-accent-foreground",
                )}
              >
                Hubungkan
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Sign out ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void handleSignOut()} disabled={signingOut}>
          {signingOut ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 size-4" />
          )}
          Keluar
        </Button>
      </div>
    </div>
  );
}
