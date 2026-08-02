import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retrieve the current structured JSONB memory object for a user.
 */
export async function getStructuredMemory(userId: string): Promise<Record<string, unknown>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("structured_memory")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[structured-memory] Fetch error:", error.message);
      return {};
    }

    return (data?.structured_memory as Record<string, unknown>) ?? {};
  } catch (err) {
    console.error("[structured-memory] Failed to get memory:", err);
    return {};
  }
}

/**
 * Update the user's structured JSONB memory by saving the complete new object.
 */
export async function saveStructuredMemory(
  userId: string,
  newMemory: Record<string, unknown>,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({
        structured_memory: newMemory,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("[structured-memory] Update error:", error.message);
      return false;
    }

    console.log(`[structured-memory] Saved updated structured memory for user ${userId}`);
    return true;
  } catch (err) {
    console.error("[structured-memory] Failed to save memory:", err);
    return false;
  }
}

// Re-exported so existing importers (the chat route) keep one import site,
// while the logic lives in a module the selfcheck can actually load.
export { formatStructuredMemory, isVolatileProfileKey } from "./structured-memory-format";
