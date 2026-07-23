import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 280;

/**
 * List the signed-in user's projects. Most-recently-updated first.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, color, description, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[projects] list failed:", error.message);
    return NextResponse.json(
      { error: "Failed to load projects." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as ProjectRow[];
  const projects = rows.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    description: p.description,
    createdAt: new Date(p.created_at).getTime(),
    updatedAt: new Date(p.updated_at).getTime(),
  }));

  return NextResponse.json({ projects });
}

/**
 * Create a new project owned by the signed-in user.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; color?: unknown; description?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  const name = body.name.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name must be between 1 and ${MAX_NAME_LENGTH} characters` },
      { status: 400 },
    );
  }

  const colorRaw = typeof body.color === "string" ? body.color.trim() : "";
  const color = /^([a-z0-9_-]{1,40})$/.test(colorRaw) ? colorRaw : "default";

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      color,
      description,
    })
    .select("id, name, color, description, created_at, updated_at")
    .single();

  if (error) {
    console.error("[projects] create failed:", error.message);
    return NextResponse.json(
      { error: "Failed to create project." },
      { status: 500 },
    );
  }

  const p = data as ProjectRow;
  return NextResponse.json({
    project: {
      id: p.id,
      name: p.name,
      color: p.color,
      description: p.description,
      createdAt: new Date(p.created_at).getTime(),
      updatedAt: new Date(p.updated_at).getTime(),
    },
  });
}
