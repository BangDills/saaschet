import { redirect } from "next/navigation";

/**
 * The settings that used to live here — name, password, GitHub connection,
 * sign out — are now all on /profile, so there is one account screen (and
 * one password form) instead of two overlapping ones. Kept as a redirect so
 * existing links and bookmarks still land somewhere useful.
 */
export default function AuthSettingsPage() {
  redirect("/profile");
}
