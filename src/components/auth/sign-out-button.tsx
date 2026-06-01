"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </form>
  );
}
