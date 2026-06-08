import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export type SerenaToolInfo = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
};

export type SerenaToolResult = {
  isError?: boolean;
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  toolResult?: unknown;
};

function serenaHeaders(authToken: string | null): HeadersInit | undefined {
  if (!authToken) return undefined;
  return { Authorization: `Bearer ${authToken}` };
}

function serenaClient() {
  return new Client({
    name: "saaschet-serena-client",
    version: "0.1.0",
  });
}

async function connectSerena(
  serverUrl: string,
  authToken: string | null,
): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const url = new URL(serverUrl);
  const requestInit = { headers: serenaHeaders(authToken) };
  const client = serenaClient();
  let transport:
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | null = new StreamableHTTPClientTransport(url, { requestInit });

  try {
    await client.connect(transport);
  } catch (streamableErr) {
    await transport.close().catch(() => {});

    transport = new SSEClientTransport(url, {
      requestInit,
      eventSourceInit: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...(init?.headers ?? {}),
              ...(serenaHeaders(authToken) ?? {}),
            },
          }),
      },
    });

    try {
      await client.connect(transport);
    } catch (sseErr) {
      await transport.close().catch(() => {});
      throw new Error(
        `Could not connect to Serena MCP server: ${
          sseErr instanceof Error
            ? sseErr.message
            : streamableErr instanceof Error
              ? streamableErr.message
              : String(sseErr)
        }`,
      );
    }
  }

  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
      await transport?.close().catch(() => {});
    },
  };
}

export async function listSerenaTools({
  serverUrl,
  authToken,
}: {
  serverUrl: string;
  authToken: string | null;
}): Promise<SerenaToolInfo[]> {
  const { client, close } = await connectSerena(serverUrl, authToken);
  try {
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }));
  } finally {
    await close();
  }
}

export async function callSerenaTool({
  serverUrl,
  authToken,
  toolName,
  arguments: args,
}: {
  serverUrl: string;
  authToken: string | null;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<SerenaToolResult> {
  const { client, close } = await connectSerena(serverUrl, authToken);
  try {
    return (await client.callTool({
      name: toolName,
      arguments: args,
    })) as SerenaToolResult;
  } finally {
    await close();
  }
}
