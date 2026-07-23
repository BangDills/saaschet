import { NextResponse, type NextRequest } from "next/server";
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

/** GET /api/projects/[id] — load a single owned project. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[projects] get failed:", error.message);
    return NextResponse.json(
      { error: "Failed to load project." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

/** PATCH /api/projects/[id] — rename, recolor, or update description. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: unknown;
    color?: unknown;
    description?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: {
    name?: string;
    color?: string;
    description?: string | null;
  } = {};

  if (body.name !== undefined) {
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
    updates.name = name;
  }

  if (body.color !== undefined) {
    if (typeof body.color !== "string") {
      return NextResponse.json({ error: "color must be a string" }, { status: 400 });
    }
    const color = body.color.trim();
    if (!/^([a-z0-9_-]{1,40})$/.test(color)) {
      return NextResponse.json(
        { error: "color must be a short lowercase slug" },
        { status: 400 },
      );
    }
    updates.color = color;
  }

  if (body.description !== undefined) {
    updates.description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null
        : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, color, description, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[projects] patch failed:", error.message);
    return NextResponse.json(
      { error: "Failed to update project." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

/** DELETE /api/projects/[id] — delete the project.
 *  Conversations keep their rows; their project_id is set to NULL (ON DELETE
 *  SET NULL on the FK), so no chats are lost. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[projects] delete failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete project." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
