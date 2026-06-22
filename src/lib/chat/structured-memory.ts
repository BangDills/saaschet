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

/**
 * Format the structured memory object into a readable markdown bulleted list for system prompt injection.
 */
export function formatStructuredMemory(memory: Record<string, unknown>): string {
  const keys = Object.keys(memory);
  if (keys.length === 0) return "";

  const lines = keys
    .map((key) => {
      const val = memory[key];
      const stringifiedVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      return `- ${key}: ${stringifiedVal}`;
    })
    .join("\n");

  return `\n\n## User Profile & Structured Preferences\n${lines}`;
}
