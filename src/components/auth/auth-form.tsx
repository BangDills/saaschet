"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AuthState } from "@/app/(auth)/login/actions";

type AuthFormProps = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

function SubmitButton({ mode }: { mode: "login" | "signup" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {mode === "login" ? "Sign in" : "Create account"}
    </Button>
  );
}

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction] = React.useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "login"
            ? "Sign in to continue your conversations."
            : "Start chatting with multiple AI models in one place."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "signup" && (
          <Field
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            placeholder="Adela Parkson"
          />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          placeholder={mode === "signup" ? "At least 6 characters" : ""}
          minLength={mode === "signup" ? 6 : undefined}
        />

        {state?.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {state.error}
          </p>
        )}
        {state?.message && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {state.message}
          </p>
        )}

        <SubmitButton mode={mode} />
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground hover:underline"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </label>
  );
}
