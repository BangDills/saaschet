import { redactVendorPath } from "@/lib/url";
import type { ActivityCategory } from "./activity-types";

function shortPath(path: unknown): string {
  if (typeof path !== "string" || !path) return "";
  const redacted = redactVendorPath(path);
  const parts = redacted.split("/");
  return parts[parts.length - 1] || redacted;
}

function countFiles(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

/** Derive human-friendly title, description, and technical details for an item. */
type ActivityCopy = {
  title: string;
  description: string;
  technicalDetails?: string;
};

const COPY_BY_TOOL: Record<string, (input: Record<string, unknown>) => ActivityCopy> = {
  list_files: (i) => ({
    title: "Exploring project",
    description: shortPath(i.path)
      ? `Scanning the ${shortPath(i.path)} directory structure`
      : "Scanning the repository structure and identifying important files",
    technicalDetails: typeof i.path === "string" ? i.path : "/",
  }),
  sandbox_list_files: (i) => ({
    title: "Exploring sandbox",
    description: shortPath(i.path)
      ? `Scanning the ${shortPath(i.path)} directory in sandbox`
      : "Scanning sandbox files",
    technicalDetails: typeof i.path === "string" ? i.path : "/",
  }),
  read_file: (i) => ({
    title: "Analyzing files",
    description: shortPath(i.path)
      ? `Reviewing ${shortPath(i.path)} to understand the code`
      : "Reviewing source files to understand the codebase",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  sandbox_read_file: (i) => ({
    title: "Analyzing files",
    description: shortPath(i.path)
      ? `Reviewing ${shortPath(i.path)} in sandbox`
      : "Reviewing sandbox files",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  search_code: (i) => ({
    title: "Searching codebase",
    description: typeof i.query === "string"
      ? `Looking for "${i.query}" across the codebase`
      : "Searching the codebase for relevant code",
    technicalDetails: typeof i.query === "string" ? i.query : undefined,
  }),
  web_search: (i) => ({
    title: "Searching web",
    description: typeof i.query === "string"
      ? `Searching the web for "${i.query}"`
      : "Searching the web for up-to-date information",
    technicalDetails: typeof i.query === "string" ? i.query : undefined,
  }),
  context7_search_library: (i) => ({
    title: "Searching documentation",
    description: typeof i.libraryName === "string"
      ? `Looking up documentation for ${i.libraryName}`
      : "Searching library documentation",
    technicalDetails: typeof i.libraryName === "string" ? i.libraryName : undefined,
  }),
  context7_get_docs: (i) => ({
    title: "Reading documentation",
    description: typeof i.libraryId === "string"
      ? `Reading ${i.libraryId} documentation`
      : "Reading library documentation",
    technicalDetails: typeof i.libraryId === "string" ? i.libraryId : undefined,
  }),
  serena_list_tools: () => ({
    title: "Checking available tools",
    description: "Discovering available Serena semantic tools",
  }),
  serena_call_tool: (i) => ({
    title: "Using semantic tools",
    description: typeof i.toolName === "string"
      ? `Calling Serena ${i.toolName}`
      : "Using semantic code analysis",
    technicalDetails: typeof i.toolName === "string" ? i.toolName : undefined,
  }),
  run_command: (i) => {
    const cmd = typeof i.command === "string" ? i.command : "";
    const desc = describeCommand(cmd);
    return {
      title: desc.title,
      description: desc.description,
      technicalDetails: cmd || undefined,
    };
  },
  execute_code: (i) => ({
    title: "Executing code",
    description: "Running a code snippet to test or apply changes",
    technicalDetails:
      typeof i.script === "string"
        ? i.script
        : typeof i.command === "string"
          ? i.command
          : undefined,
  }),
  write_file: (i) => ({
    title: "Creating files",
    description: shortPath(i.path)
      ? `Writing ${shortPath(i.path)} with new content`
      : "Creating a new file",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  sandbox_write_file: (i) => ({
    title: "Creating files",
    description: shortPath(i.path)
      ? `Writing ${shortPath(i.path)} in sandbox`
      : "Creating a new file in sandbox",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  write_files: (i) => ({
    title: "Creating files",
    description: `${countFiles(i.files)} file(s) being written to the project`,
    technicalDetails: undefined,
  }),
  sandbox_write_files: (i) => ({
    title: "Creating files",
    description: `${countFiles(i.files)} file(s) being written in sandbox`,
    technicalDetails: undefined,
  }),
  edit_file: (i) => ({
    title: "Updating files",
    description: shortPath(i.path)
      ? `Modifying ${shortPath(i.path)} to apply changes`
      : "Editing an existing file",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  delete_file: (i) => ({
    title: "Deleting files",
    description: shortPath(i.path)
      ? `Removing ${shortPath(i.path)} from the project`
      : "Deleting a file",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  create_pull_request: (i) => ({
    title: "Applying changes",
    description: typeof i.title === "string"
      ? `Creating pull request: "${i.title}"`
      : "Creating a pull request with the changes",
    technicalDetails: typeof i.title === "string" ? i.title : undefined,
  }),
  report_state: () => ({
    title: "Reporting progress",
    description: "Summarizing completed work and next steps",
  }),
};

/** Describe a shell command in human terms. */
function describeCommand(cmd: string): { title: string; description: string } {
  const lower = cmd.toLowerCase();

  if (/^(npm test|pnpm test|yarn test)/.test(lower)) {
    return { title: "Running validation", description: "Running tests to verify correctness" };
  }
  if (/^(npm run lint|pnpm run lint|yarn lint)/.test(lower) || /\blint\b/.test(lower)) {
    return { title: "Running validation", description: "Checking code quality and style" };
  }
  if (/^(npm run build|pnpm run build|yarn build)/.test(lower)) {
    return { title: "Running validation", description: "Building the project to catch errors" };
  }
  if (/^(npm run|pnpm run|yarn )/.test(lower)) {
    return { title: "Executing tasks", description: cmd.substring(0, 60) };
  }
  if (/^git status/.test(lower)) {
    return { title: "Analyzing files", description: "Checking Git status for modified files" };
  }
  if (/^git diff/.test(lower) || /^git log/.test(lower)) {
    return { title: "Analyzing files", description: "Reviewing recent changes and commit history" };
  }
  if (/^git checkout|^git switch/.test(lower)) {
    return { title: "Planning changes", description: "Switching to the working branch" };
  }
  if (/^git pull/.test(lower) || /^git fetch/.test(lower)) {
    return { title: "Analyzing files", description: "Syncing with remote repository" };
  }
  if (/^git add|^git commit|^git push/.test(lower)) {
    return { title: "Applying changes", description: "Committing and pushing changes" };
  }
  if (/^git clone/.test(lower)) {
    return { title: "Exploring project", description: "Cloning the repository" };
  }
  if (/^git /.test(lower)) {
    return { title: "Analyzing files", description: "Running Git operations" };
  }
  if (/^(cat|less|head|tail|wc|du|df|which|type|find|grep|ag|rg|ack) /.test(lower)) {
    return { title: "Analyzing files", description: `Inspecting files and project structure` };
  }
  if (/^(npm ls|npm list|pnpm ls|pip list)/.test(lower)) {
    return { title: "Analyzing files", description: "Reviewing project dependencies" };
  }
  if (/^(npx create)/.test(lower)) {
    return { title: "Creating files", description: "Bootstrapping new project files" };
  }
  if (/^(sed|awk)/.test(lower)) {
    return { title: "Updating files", description: "Modifying file content" };
  }
  return { title: "Executing tasks", description: `Running: ${cmd.substring(0, 60)}` };
}

const CATEGORY_FALLBACK: Record<ActivityCategory, { title: string; description: string }> = {
  exploring: { title: "Exploring project", description: "Scanning the repository structure" },
  analyzing: { title: "Analyzing files", description: "Reviewing source files" },
  searching: { title: "Searching codebase", description: "Searching for relevant code" },
  planning: { title: "Planning changes", description: "Determining next steps" },
  updating: { title: "Updating files", description: "Modifying existing files" },
  creating: { title: "Creating files", description: "Adding new files to the project" },
  deleting: { title: "Deleting files", description: "Removing files from the project" },
  executing: { title: "Executing tasks", description: "Running tasks" },
  validating: { title: "Running validation", description: "Running tests and checks" },
  applying: { title: "Applying changes", description: "Finalizing changes" },
};

export function deriveCopy(
  toolName: string,
  input: unknown,
  category: ActivityCategory,
): ActivityCopy {
  const gen = COPY_BY_TOOL[toolName];
  if (gen) {
    try {
      const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const copy = gen(obj);
      if (copy.title) return copy;
    } catch {
      // fall through
    }
  }
  const fallback = CATEGORY_FALLBACK[category];
  return fallback ?? { title: "Executing tasks", description: "Working" };
}
