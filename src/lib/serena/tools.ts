import { tool, jsonSchema } from "ai";
import { callSerenaTool, listSerenaTools } from "@/lib/serena/client";

export type SerenaToolsContext = {
  serverUrl: string | null;
  authToken: string | null;
  allowWriteTools: boolean;
};

const READ_ONLY_TOOL_NAMES = new Set([
  "check_onboarding_performed",
  "find_file",
  "find_referencing_symbols",
  "find_symbol",
  "get_current_config",
  "get_symbols_overview",
  "list_dir",
  "list_memories",
  "read_file",
  "read_memory",
  "search_for_pattern",
]);

const WRITE_OR_EXECUTE_PATTERNS = [
  "write",
  "replace",
  "insert",
  "delete",
  "remove",
  "rename",
  "move",
  "execute",
  "shell",
  "restart",
  "activate",
  "onboard",
  "memory",
];

function schema<T>(s: object) {
  return jsonSchema<T>(s as never);
}

function isAllowedSerenaTool(toolName: string, allowWriteTools: boolean) {
  if (allowWriteTools) return true;
  if (READ_ONLY_TOOL_NAMES.has(toolName)) return true;

  const lower = toolName.toLowerCase();
  return !WRITE_OR_EXECUTE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function compactSerenaResult(value: unknown, maxChars = 24_000) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (text.length <= maxChars) {
    return {
      truncated: false,
      length: text.length,
      content: text,
    };
  }

  return {
    truncated: true,
    length: text.length,
    content: `${text.slice(0, maxChars)}\n\n[truncated]`,
  };
}

export function createSerenaTools(ctx: SerenaToolsContext) {
  return {
    serena_list_tools: tool({
      description:
        "List available Serena semantic code tools from the configured MCP server. " +
        "Use this before serena_call_tool when you need symbol-level code navigation.",
      inputSchema: schema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        if (!ctx.serverUrl) {
          return {
            error:
              "Serena is unavailable (SERENA_MCP_URL is not configured).",
          };
        }

        const tools = await listSerenaTools({
          serverUrl: ctx.serverUrl,
          authToken: ctx.authToken,
        });

        return {
          count: tools.length,
          writeToolsEnabled: ctx.allowWriteTools,
          tools: tools.map((serenaTool) => ({
            name: serenaTool.name,
            description: serenaTool.description,
            allowed: isAllowedSerenaTool(
              serenaTool.name,
              ctx.allowWriteTools,
            ),
            inputSchema: serenaTool.inputSchema,
          })),
        };
      },
    }),

    serena_call_tool: tool({
      description:
        "Call a Serena semantic code tool. Use this for symbol overview, find symbol, " +
        "find references, and precise code discovery in a repo/project served by Serena. " +
        "By default only read-only semantic tools are allowed.",
      inputSchema: schema<{
        toolName: string;
        arguments?: Record<string, unknown>;
      }>({
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description:
              "Serena MCP tool name, e.g. get_symbols_overview or find_symbol.",
          },
          arguments: {
            type: "object",
            description:
              "Arguments matching the Serena tool's input schema.",
            additionalProperties: true,
          },
        },
        required: ["toolName"],
        additionalProperties: false,
      }),
      execute: async ({
        toolName,
        arguments: args = {},
      }: {
        toolName: string;
        arguments?: Record<string, unknown>;
      }) => {
        if (!ctx.serverUrl) {
          return {
            error:
              "Serena is unavailable (SERENA_MCP_URL is not configured).",
          };
        }

        if (!isAllowedSerenaTool(toolName, ctx.allowWriteTools)) {
          return {
            error:
              `Serena tool '${toolName}' is blocked by default. ` +
              "Set SERENA_ALLOW_WRITE_TOOLS=true only if you explicitly want Serena write/execute tools enabled.",
          };
        }

        const result = await callSerenaTool({
          serverUrl: ctx.serverUrl,
          authToken: ctx.authToken,
          toolName,
          arguments: args,
        });

        return {
          toolName,
          isError: result.isError,
          structuredContent: result.structuredContent,
          toolResult: result.toolResult,
          ...compactSerenaResult(result.content ?? result),
        };
      },
    }),
  };
}

export type SerenaTools = ReturnType<typeof createSerenaTools>;
