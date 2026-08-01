import { redactVendorPath } from "@/lib/url";
import type { ActivityCategory, ActivityStatus } from "./activity-types";

/**
 * Semantic event layer — turns raw tool calls (and the shell commands inside
 * them) into structured, human-meaningful activities. The UI renders ONLY the
 * output of this module; raw commands/queries surface exclusively through
 * `technicalDetails` (the "Technical Details" expando).
 */

export type SemanticEvent = {
  category: ActivityCategory;
  /** Meaningful action, e.g. "Checking Git status" — never a raw command. */
  title: string;
  /** One-sentence description of intent. */
  description: string;
  /** Raw command / query / path — only shown inside Technical Details. */
  technicalDetails?: string;
};

function shortPath(path: unknown): string {
  if (typeof path !== "string" || !path) return "";
  const redacted = redactVendorPath(path);
  const parts = redacted.split("/");
  return parts[parts.length - 1] || redacted;
}

function countFiles(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

function truncateText(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Shell command interpretation
// ---------------------------------------------------------------------------

type CommandMeaning = Omit<SemanticEvent, "technicalDetails">;

/** Category priority when a compound command (`cd x && npm test`) mixes
 *  meanings — the most consequential segment names the activity. */
const CATEGORY_PRIORITY: ActivityCategory[] = [
  "validating",
  "applying",
  "deleting",
  "updating",
  "creating",
  "planning",
  "executing",
  "searching",
  "analyzing",
  "exploring",
];

const CONFIG_FILE_RE =
  /(^|\/)(tsconfig|eslint|prettier|babel|vite|webpack|next\.config|nuxt\.config|\.env|[\w.-]*config[\w.-]*|[\w.-]+\.(ya?ml|toml|ini))(\b|$)/i;

/** Interpret ONE simple command (no &&/;/| composition). */
function interpretSegment(cmd: string): CommandMeaning | null {
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Strip leading env-var assignments (`NODE_ENV=test npm test`).
  const stripped = lower.replace(/^(\w+=[^\s]*\s+)+/, "");
  const head = stripped.split(/\s+/)[0] ?? "";

  // Ignore pure navigation/no-ops so the meaningful segment wins.
  if (head === "cd" || head === "pwd" || head === "true" || head === ":") return null;

  // ── Validation ──
  if (
    /^(npm|pnpm|yarn|bun)( run)? test\b/.test(stripped) ||
    /^(vitest|jest|mocha|pytest|go test|cargo test)\b/.test(stripped)
  ) {
    return {
      category: "validating",
      title: "Running tests",
      description: "Running the test suite to verify correctness",
    };
  }
  if (/^(npm|pnpm|yarn|bun)( run)? lint\b/.test(stripped) || /^(eslint|biome|ruff|flake8)\b/.test(stripped)) {
    return {
      category: "validating",
      title: "Checking code quality",
      description: "Linting the code for style and quality issues",
    };
  }
  if (/^(npm|pnpm|yarn|bun)( run)? build\b/.test(stripped)) {
    return {
      category: "validating",
      title: "Building the project",
      description: "Building the project to catch compilation errors",
    };
  }
  if (/^tsc\b/.test(stripped) || /^npx tsc\b/.test(stripped)) {
    return {
      category: "validating",
      title: "Type-checking the project",
      description: "Verifying TypeScript types across the project",
    };
  }

  // ── Git ──
  if (/^git status\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Checking Git status",
      description: "Reviewing which files have been modified",
    };
  }
  if (/^git (diff|log|show|blame)\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Reviewing recent changes",
      description: "Inspecting changes and commit history",
    };
  }
  if (/^git (checkout|switch|branch)\b/.test(stripped)) {
    return {
      category: "planning",
      title: "Preparing the working branch",
      description: "Switching to the branch where changes will be made",
    };
  }
  if (/^git (pull|fetch)\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Syncing with the remote repository",
      description: "Fetching the latest changes from the remote",
    };
  }
  if (/^git (add|commit|push)\b/.test(stripped)) {
    return {
      category: "applying",
      title: "Applying updates",
      description: "Committing and pushing the changes",
    };
  }
  if (/^git clone\b/.test(stripped)) {
    return {
      category: "exploring",
      title: "Cloning the repository",
      description: "Downloading the repository into the workspace",
    };
  }
  if (/^git\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Running Git operations",
      description: "Working with the Git repository",
    };
  }

  // ── Exploration / inspection ──
  if (/^(ls|tree|exa|dir)\b/.test(stripped)) {
    return {
      category: "exploring",
      title: "Inspecting repository structure",
      description: "Listing directories to map the project layout",
    };
  }
  if (/^(find|fd)\b/.test(stripped)) {
    const configTarget = CONFIG_FILE_RE.test(stripped);
    return {
      category: "searching",
      title: configTarget ? "Locating configuration files" : "Locating project files",
      description: "Scanning the project tree for matching files",
    };
  }
  if (/^(grep|rg|ag|ack)\b/.test(stripped)) {
    return {
      category: "searching",
      title: "Searching project files",
      description: "Searching file contents for relevant code",
    };
  }
  if (/^(cat|head|tail|less|more|wc)\b/.test(stripped)) {
    if (/package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(stripped)) {
      return {
        category: "analyzing",
        title: "Reviewing dependencies",
        description: "Reading the package manifest to understand dependencies",
      };
    }
    if (/\.html?\b/.test(stripped)) {
      return {
        category: "analyzing",
        title: "Analyzing HTML structure",
        description: "Reading markup to understand the page structure",
      };
    }
    if (CONFIG_FILE_RE.test(stripped)) {
      return {
        category: "analyzing",
        title: "Reviewing project configuration",
        description: "Reading configuration files to understand project setup",
      };
    }
    if (/readme|\.md\b/.test(stripped)) {
      return {
        category: "analyzing",
        title: "Reading project documentation",
        description: "Reviewing documentation for context",
      };
    }
    return {
      category: "analyzing",
      title: "Reviewing file contents",
      description: "Reading files to understand the current implementation",
    };
  }
  if (/^(npm (ls|list)|pnpm (ls|list)|yarn list|pip list)\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Reviewing dependencies",
      description: "Listing installed packages and versions",
    };
  }

  // ── Package / project management ──
  if (/^(npm|pnpm|yarn|bun) (install|ci|add)\b/.test(stripped) || /^pip install\b/.test(stripped)) {
    return {
      category: "executing",
      title: "Installing dependencies",
      description: "Installing the packages the project needs",
    };
  }
  if (/^(npx create|npm init|yarn create|pnpm create)\b/.test(stripped)) {
    return {
      category: "creating",
      title: "Bootstrapping project files",
      description: "Generating a new project scaffold",
    };
  }
  if (/^(npm|pnpm|bun) run\b/.test(stripped) || /^yarn\s+\w/.test(stripped)) {
    return {
      category: "executing",
      title: "Running a project script",
      description: "Executing a script defined by the project",
    };
  }

  // ── File modification via shell ──
  if (/^(sed|awk|perl)\b/.test(stripped)) {
    return {
      category: "updating",
      title: "Preparing code modifications",
      description: "Applying scripted edits to file content",
    };
  }
  if (/^(echo|printf)\b.*(>>?|\|\s*tee)\s/.test(stripped)) {
    return {
      category: "updating",
      title: "Writing file content",
      description: "Writing content into a project file",
    };
  }
  if (/^(echo|printf|printenv|env|which|type|node -v|node --version|whoami|date|uname)\b/.test(stripped)) {
    return {
      category: "analyzing",
      title: "Checking environment details",
      description: "Inspecting the runtime environment",
    };
  }
  if (/^(mkdir|cp|mv|touch|ln)\b/.test(stripped)) {
    return {
      category: "executing",
      title: "Organizing project files",
      description: "Arranging files and directories in the workspace",
    };
  }
  if (/^(rm|rmdir)\b/.test(stripped)) {
    return {
      category: "deleting",
      title: "Removing files",
      description: "Deleting files that are no longer needed",
    };
  }
  if (/^(chmod|chown)\b/.test(stripped)) {
    return {
      category: "executing",
      title: "Adjusting file permissions",
      description: "Updating access permissions in the workspace",
    };
  }
  if (/^(curl|wget)\b/.test(stripped)) {
    return {
      category: "executing",
      title: "Fetching external resources",
      description: "Downloading data from an external source",
    };
  }
  if (/^(node|python3?|ts-node|tsx|deno|ruby|php)\b/.test(stripped)) {
    return {
      category: "executing",
      title: "Running project code",
      description: "Executing code to test behavior or produce output",
    };
  }

  return {
    category: "executing",
    title: "Executing a task",
    description: "Running an operation in the workspace",
  };
}

/**
 * Interpret a full shell command in human terms. Compound commands
 * (`cd repo && npm test`) resolve to their most consequential segment.
 * The raw command is never part of the returned title/description.
 */
export function interpretCommand(cmd: string): CommandMeaning {
  const fallback: CommandMeaning = {
    category: "executing",
    title: "Executing a task",
    description: "Running an operation in the workspace",
  };
  if (!cmd) return fallback;

  const segments = cmd
    .split(/&&|\|\||;|\|/)
    .map((s) => interpretSegment(s))
    .filter((m): m is CommandMeaning => m !== null);
  if (segments.length === 0) return fallback;

  for (const cat of CATEGORY_PRIORITY) {
    const match = segments.find((s) => s.category === cat);
    if (match) return match;
  }
  return segments[0];
}

// ---------------------------------------------------------------------------
// Per-tool semantic copy
// ---------------------------------------------------------------------------

const EVENT_BY_TOOL: Record<string, (input: Record<string, unknown>) => SemanticEvent> = {
  list_files: (i) => ({
    category: "exploring",
    title: shortPath(i.path) ? `Exploring ${shortPath(i.path)}/` : "Exploring project structure",
    description: "Scanning directories to identify important files",
    technicalDetails: typeof i.path === "string" ? i.path : "/",
  }),
  sandbox_list_files: (i) => ({
    category: "exploring",
    title: shortPath(i.path) ? `Exploring ${shortPath(i.path)}/` : "Exploring the workspace",
    description: "Scanning workspace directories",
    technicalDetails: typeof i.path === "string" ? i.path : "/",
  }),
  read_file: (i) => ({
    category: "analyzing",
    title: shortPath(i.path) ? `Reviewing ${shortPath(i.path)}` : "Reviewing source files",
    description: "Reading the file to understand the current implementation",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  read_files: (i) => ({
    category: "analyzing",
    title: `Reviewing ${countFiles(i.paths)} files`,
    description: "Reading several files at once to understand the project",
    technicalDetails: Array.isArray(i.paths) ? i.paths.join(", ") : undefined,
  }),
  sandbox_read_file: (i) => ({
    category: "analyzing",
    title: shortPath(i.path) ? `Reviewing ${shortPath(i.path)}` : "Reviewing workspace files",
    description: "Reading the file from the workspace",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  search_code: (i) => ({
    category: "searching",
    title:
      typeof i.query === "string"
        ? `Searching for ${truncateText(`"${i.query}"`, 40)}`
        : "Searching the codebase",
    description: "Scanning the codebase for related code",
    technicalDetails: typeof i.query === "string" ? i.query : undefined,
  }),
  web_search: (i) => ({
    category: "searching",
    title: "Searching the web",
    description:
      typeof i.query === "string"
        ? `Looking up ${truncateText(`"${i.query}"`, 60)}`
        : "Looking up current information",
    technicalDetails: typeof i.query === "string" ? i.query : undefined,
  }),
  context7_search_library: (i) => ({
    category: "searching",
    title:
      typeof i.libraryName === "string"
        ? `Looking up ${i.libraryName} docs`
        : "Looking up documentation",
    description: "Finding up-to-date library documentation",
    technicalDetails: typeof i.libraryName === "string" ? i.libraryName : undefined,
  }),
  context7_get_docs: (i) => ({
    category: "analyzing",
    title: "Reading documentation",
    description:
      typeof i.libraryId === "string"
        ? `Studying ${i.libraryId} documentation`
        : "Studying library documentation",
    technicalDetails: typeof i.libraryId === "string" ? i.libraryId : undefined,
  }),
  serena_list_tools: () => ({
    category: "searching",
    title: "Checking analysis tools",
    description: "Discovering available semantic analysis tools",
  }),
  serena_call_tool: (i) => ({
    category: "analyzing",
    title: "Running semantic analysis",
    description: "Analyzing code structure with semantic tools",
    technicalDetails: typeof i.toolName === "string" ? i.toolName : undefined,
  }),
  run_command: (i) => {
    const cmd = typeof i.command === "string" ? i.command : "";
    return { ...interpretCommand(cmd), technicalDetails: cmd || undefined };
  },
  execute_code: (i) => ({
    category: "executing",
    title: "Running a code snippet",
    description: "Executing code to test behavior or apply changes",
    technicalDetails:
      typeof i.script === "string"
        ? i.script
        : typeof i.command === "string"
          ? i.command
          : undefined,
  }),
  write_file: (i) => ({
    category: "creating",
    title: shortPath(i.path) ? `Writing ${shortPath(i.path)}` : "Writing a file",
    description: "Writing file content into the project",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  sandbox_write_file: (i) => ({
    category: "creating",
    title: shortPath(i.path) ? `Writing ${shortPath(i.path)}` : "Writing a file",
    description: "Writing file content into the workspace",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  write_files: (i) => ({
    category: "creating",
    title: `Writing ${countFiles(i.files)} files`,
    description: "Writing multiple files into the project",
  }),
  sandbox_write_files: (i) => ({
    category: "creating",
    title: `Writing ${countFiles(i.files)} files`,
    description: "Writing multiple files into the workspace",
  }),
  edit_file: (i) => ({
    category: "updating",
    title: shortPath(i.path) ? `Modifying ${shortPath(i.path)}` : "Modifying a file",
    description: "Applying targeted changes to the file",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  delete_file: (i) => ({
    category: "deleting",
    title: shortPath(i.path) ? `Removing ${shortPath(i.path)}` : "Removing a file",
    description: "Removing the file from the project",
    technicalDetails: typeof i.path === "string" ? i.path : undefined,
  }),
  create_pull_request: (i) => ({
    category: "applying",
    title: "Opening a pull request",
    description:
      typeof i.title === "string"
        ? `Submitting the changes: "${truncateText(i.title, 60)}"`
        : "Submitting the changes for review",
    technicalDetails: typeof i.title === "string" ? i.title : undefined,
  }),
  report_state: () => ({
    category: "planning",
    title: "Summarizing progress",
    description: "Recording what was accomplished and what comes next",
  }),
};

const CATEGORY_FALLBACK: Record<ActivityCategory, Omit<SemanticEvent, "technicalDetails">> = {
  exploring: { category: "exploring", title: "Exploring project", description: "Scanning the repository structure" },
  analyzing: { category: "analyzing", title: "Analyzing files", description: "Reviewing source files" },
  searching: { category: "searching", title: "Searching codebase", description: "Searching for relevant code" },
  planning: { category: "planning", title: "Planning changes", description: "Determining next steps" },
  updating: { category: "updating", title: "Updating files", description: "Modifying existing files" },
  creating: { category: "creating", title: "Creating files", description: "Adding new files to the project" },
  deleting: { category: "deleting", title: "Deleting files", description: "Removing files from the project" },
  executing: { category: "executing", title: "Executing tasks", description: "Running tasks in the workspace" },
  validating: { category: "validating", title: "Running validation", description: "Running tests and checks" },
  applying: { category: "applying", title: "Applying changes", description: "Finalizing changes" },
};

/** Derive the semantic event (category + human copy) for one tool call. */
export function deriveSemanticEvent(toolName: string, input: unknown): SemanticEvent {
  const gen = EVENT_BY_TOOL[toolName];
  if (gen) {
    try {
      const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const event = gen(obj);
      if (event.title) return event;
    } catch {
      // fall through
    }
  }
  return { ...CATEGORY_FALLBACK.planning };
}

// ---------------------------------------------------------------------------
// Outcome classification — user outcome, not shell exit codes
// ---------------------------------------------------------------------------

/** Errors that mean the capability is missing, not that the task failed. */
const UNAVAILABLE_RE =
  /sandbox.*(unavailable|not.*initiali[sz]ed|failed to initiali[sz]e)|no sandbox|not (configured|available|connected)|missing.*api key|api key (is )?(not set|missing)|feature.*disabled/i;

/** Errors the user genuinely has to act on. */
const ATTENTION_RE =
  /permission denied|authentication failed|invalid credentials|unauthori[sz]ed|forbidden|bad credentials|token.*expired|could not authenticate|\b401\b|\b403\b/i;

/** Command families where exit code 1 conventionally means "no result",
 *  not "something went wrong" (grep, diff, test …). */
const BENIGN_EXIT_1_RE = /^(\w+=[^\s]*\s+)*(grep|rg|ag|ack|find|fd|diff|cmp|test|\[)\b/;

function extractExitCode(output: Record<string, unknown>): number | null {
  return typeof output.exitCode === "number" ? output.exitCode : null;
}

function extractErrorMessage(
  output: Record<string, unknown> | null,
  errorText: string | undefined,
): string {
  if (errorText) return errorText;
  if (!output) return "";
  if (typeof output.error === "string" && output.error) return output.error;
  if (typeof output.stderr === "string" && output.stderr) return output.stderr;
  return "";
}

/**
 * Classify a settled tool call by USER OUTCOME. Empty search results and
 * benign non-zero exits are `completed`; missing infrastructure is
 * `unavailable`; only genuine blockers become `needs-attention`.
 */
export function classifyOutcome(opts: {
  toolName: string;
  input: unknown;
  output: unknown;
  state: string;
  errorText?: string;
}): ActivityStatus {
  const output =
    opts.output && typeof opts.output === "object"
      ? (opts.output as Record<string, unknown>)
      : null;

  if (output?.skipped === true) return "skipped";

  const explicitFailure =
    opts.state === "output-error" ||
    Boolean(opts.errorText) ||
    output?.success === false;
  if (!explicitFailure) return "completed";

  // Benign non-zero exits: grep/find/diff-style commands signalling
  // "no matches" through exit code 1. The task itself succeeded.
  if (
    (opts.toolName === "run_command" || opts.toolName === "execute_code") &&
    output &&
    extractExitCode(output) === 1
  ) {
    const input =
      opts.input && typeof opts.input === "object"
        ? (opts.input as Record<string, unknown>)
        : null;
    const cmd = typeof input?.command === "string" ? input.command : "";
    const segments = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim());
    if (segments.some((s) => BENIGN_EXIT_1_RE.test(s))) return "completed";
  }

  const message = extractErrorMessage(output, opts.errorText);
  if (UNAVAILABLE_RE.test(message)) return "unavailable";
  if (ATTENTION_RE.test(message)) return "needs-attention";
  return "needs-attention";
}

/** Extract the tool-reported wall-clock duration, when present. */
export function extractDurationMs(output: unknown): number | undefined {
  if (!output || typeof output !== "object") return undefined;
  const meta = (output as Record<string, unknown>).metadata;
  if (!meta || typeof meta !== "object") return undefined;
  const ms = (meta as Record<string, unknown>).durationMs;
  return typeof ms === "number" && ms >= 0 ? ms : undefined;
}
