import { tool, jsonSchema } from "ai";
import {
  getContext7Docs,
  searchContext7Libraries,
} from "@/lib/context7/client";

export type Context7ToolsContext = {
  /** Context7 key; null disables Context7 documentation tools */
  context7Key: string | null;
};

function schema<T>(s: object) {
  return jsonSchema<T>(s as never);
}

export function createContext7Tools(ctx: Context7ToolsContext) {
  return {
    context7_search_library: tool({
      description:
        "Search Context7 for an up-to-date documentation library ID. Use this " +
        "before context7_get_docs unless the user already provided an exact " +
        "Context7 ID like /vercel/next.js or /facebook/react.",
      inputSchema: schema<{ libraryName: string; query: string }>({
        type: "object",
        properties: {
          libraryName: {
            type: "string",
            description: 'Library/package/framework name, e.g. "next.js".',
          },
          query: {
            type: "string",
            description:
              "The user's task or documentation topic, used for relevance ranking.",
          },
        },
        required: ["libraryName", "query"],
        additionalProperties: false,
      }),
      execute: async ({
        libraryName,
        query,
      }: {
        libraryName: string;
        query: string;
      }) => {
        if (!ctx.context7Key) {
          return {
            error:
              "Context7 is unavailable (CONTEXT7_API_KEY is not configured).",
          };
        }

        const libraries = await searchContext7Libraries({
          apiKey: ctx.context7Key,
          libraryName,
          query,
        });

        return {
          count: libraries.length,
          results: libraries.slice(0, 8).map((library) => ({
            id: library.id,
            name: library.name,
            description: library.description,
            totalSnippets: library.totalSnippets,
            trustScore: library.trustScore,
            benchmarkScore: library.benchmarkScore,
            versions: library.versions?.slice(0, 20),
          })),
        };
      },
    }),

    context7_get_docs: tool({
      description:
        "Fetch current Context7 documentation for a library ID. Use this for " +
        "library/framework APIs, setup steps, migration details, and version-specific behavior.",
      inputSchema: schema<{
        libraryId: string;
        query: string;
        format?: "txt" | "json";
      }>({
        type: "object",
        properties: {
          libraryId: {
            type: "string",
            description:
              'Context7 library ID, e.g. "/vercel/next.js" or "/facebook/react".',
          },
          query: {
            type: "string",
            description:
              "Specific docs topic or question, e.g. 'app router route handlers'.",
          },
          format: {
            type: "string",
            enum: ["txt", "json"],
            description: "Return format. Default txt is best for model context.",
          },
        },
        required: ["libraryId", "query"],
        additionalProperties: false,
      }),
      execute: async ({
        libraryId,
        query,
        format = "txt",
      }: {
        libraryId: string;
        query: string;
        format?: "txt" | "json";
      }) => {
        if (!ctx.context7Key) {
          return {
            error:
              "Context7 is unavailable (CONTEXT7_API_KEY is not configured).",
          };
        }

        const docs = await getContext7Docs({
          apiKey: ctx.context7Key,
          libraryId,
          query,
          type: format,
        });

        const maxChars = 24_000;
        return {
          libraryId,
          query,
          format,
          truncated: docs.length > maxChars,
          length: docs.length,
          content:
            docs.length > maxChars
              ? `${docs.slice(0, maxChars)}\n\n[truncated]`
              : docs,
        };
      },
    }),
  };
}

export type Context7Tools = ReturnType<typeof createContext7Tools>;
