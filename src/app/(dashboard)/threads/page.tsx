import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ThreadsBrowser, type ProjectGroup } from "@/components/dashboard/threads-browser";

export const dynamic = "force-dynamic";

/**
 * /threads — the full library of every conversation, grouped by project.
 * The sidebar "Semua" link lands here: all projects with their chats, plus
 * unfiled chats, each one click away.
 */
export default async function ThreadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All projects for this user.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, color")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // All conversations for this user, most recently active first.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, model_id, github_repo, project_id, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  type ConvoRow = {
    id: string;
    title: string;
    model_id: string | null;
    github_repo: string | null;
    project_id: string | null;
    updated_at: string;
  };

  const convos = (conversations ?? []) as ConvoRow[];

  // Group conversations under their project; unfiled chats go to a bucket.
  const unfiled: ProjectGroup["chats"] = [];
  const byProject = new Map<string, ProjectGroup["chats"]>();
  for (const c of convos) {
    const chat = {
      id: c.id,
      title: c.title,
      modelId: c.model_id,
      githubRepo: c.github_repo,
      updatedAt: new Date(c.updated_at).getTime(),
    };
    if (c.project_id && byProject.has(c.project_id)) {
      byProject.get(c.project_id)!.push(chat);
    } else if (c.project_id) {
      byProject.set(c.project_id, [chat]);
    } else {
      unfiled.push(chat);
    }
  }

  const groups: ProjectGroup[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    chats: byProject.get(p.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Semua Threads</h2>
        <p className="text-sm text-muted-foreground">
          Seluruh percakapan Anda, dikelompokkan per project.
        </p>
      </div>
      <ThreadsBrowser groups={groups} unfiled={unfiled} />
    </div>
  );
}
