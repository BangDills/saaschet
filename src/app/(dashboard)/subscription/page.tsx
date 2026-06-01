import { redirect } from "next/navigation";

// Subscription management lives on /profile in the demo build.
// Real Stripe checkout will go here once payments are wired in.
export default function Page() {
  redirect("/profile");
}
