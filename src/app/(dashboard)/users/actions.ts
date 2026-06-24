"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Updates a user's tier and daily limit using the service role admin client.
 */
export async function updateUserTierAction(targetUserId: string, tier: "free" | "pro") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    throw new Error("Forbidden: Admin only");
  }

  const admin = createAdminClient();
  const dailyLimit = tier === "pro" ? 1000 : 50;

  const { error } = await admin
    .from("user_credits")
    .update({ tier, daily_limit: dailyLimit })
    .eq("user_id", targetUserId);

  if (error) {
    throw new Error(`Failed to update tier: ${error.message}`);
  }

  revalidatePath("/users");
  return { ok: true };
}

/**
 * Deletes a user from authentication, cascading to all public profiles and logs.
 */
export async function deleteUserAction(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    throw new Error("Forbidden: Admin only");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetUserId);

  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }

  revalidatePath("/users");
  return { ok: true };
}
