import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/ai-chat");

  return <AuthForm mode="login" action={login} />;
}
