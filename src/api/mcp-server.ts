// =============================================================================
// MCP Server — 基于 JSON-RPC 2.0 的 MCP 协议实现
// 由于 @modelcontextprotocol/sdk 的 dist/esm/index.js 缺失，
// 使用标准 JSON-RPC 协议手动实现 MCP 服务器
// 提供 3 个工具: md_status, md_search, md_navigate
// =============================================================================
import { ErrorCodes, MdGraphError } from '../types.js';
import { TemplateEngine } from './template.js';
import { createServerInstructions, getToolDefinitions } from './server-instructions.js';

// ---------------------------------------------------------------------------
// JSON-RPC 类型定义
// ---------------------------------------------------------------------------
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// MdGraph 外观接口（与 src/md-graph.ts 对齐）
// ---------------------------------------------------------------------------
export interface MdGraphFacade {
  status(): Promise<{
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    lastIndexedAt: string;
    stale: boolean;
    staleFileCount: number;
  }>;
  search(query: string, options?: { maxResults?: number; offset?: number; type?: 'heading' | 'paragraph' | 'code_block'; file?: string }): Promise<{
    totalResults: number;
    results: Array<Record<string, unknown>>;
    stale: boolean;
    staleFileCount: number;
    lastIndexedAt: string;
  }>;
  navigate(nodeId: number, direction: string, depth?: number): Promise<{
    sourceNodeId: number;
    sourcePath: string;
    topic: string;
    direction: string;
    depth: number;
    totalLinks: number;
    links: Array<Record<string, unknown>>;
    stale: boolean;
    staleFileCount: number;
    lastIndexedAt: string;
    tookMs: number;
    sourceFileId: number;
    sourceFileName: string;
  }>;
  close(): Promise<void>;
  renderStatus(): Promise<string>;
  renderSearch(query: string, options?: { maxResults?: number; offset?: number; type?: 'heading' | 'paragraph' | 'code_block'; file?: string }): Promise<string>;
  renderNavigate(nodeIdOrPath: number | string, direction: string, depth?: number): Promise<string>;
}

// =============================================================================
// McpServer
// =============================================================================
export class McpServer {
  private graph: MdGraphFacade | null;
  private templateEngine: TemplateEngine;
  private serverInfo = {
    name: 'md-graph-mcp',
    version: '0.1.0',
  };

  constructor(graph: MdGraphFacade | null) {
    this.graph = graph;
    this.templateEngine = new TemplateEngine();
  }

  // =========================================================================
  // handleRequest — 处理 JSON-RPC 请求
  // =========================================================================
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'tools/list':
          return this.handleToolsList(request);
        case 'tools/call':
          return this.handleToolsCall(request);
        case 'notifications/initialized':
          // notifications 不需要响应
          return { jsonrpc: '2.0' };
        default:
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (err) {
      if (err instanceof MdGraphError) {
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: {
            code: -32603,
            message: err.toText(),
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: `内部错误: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  }

  // =========================================================================
  // close — 关闭服务器
  // =========================================================================
  close(): void {
    // 清理资源
  }

  // =========================================================================
  // 内部方法 — 请求处理
  // =========================================================================

  /** 处理 initialize 请求 */
  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: this.serverInfo,
        instructions: createServerInstructions(),
      },
    };
  }

  /** 处理 tools/list 请求 */
  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        tools: getToolDefinitions(),
      },
    };
  }

  /** 处理 tools/call 请求 */
  private async handleToolsCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;

    if (!params || !params.name) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32602,
          message: 'Invalid params: missing tool name',
        },
      };
    }

    const toolName = params.name;
    const args = params.arguments ?? {};

    try {
      let result: ToolResult;

      switch (toolName) {
        case 'md_status':
          result = await this.callStatus();
          break;
        case 'md_search':
          result = await this.callSearch(args);
          break;
        case 'md_navigate':
          result = await this.callNavigate(args);
          break;
        default:
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: -32602,
              message: `Unknown tool: ${toolName}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result,
      };
    } catch (err) {
      // 返回 content-level ErrorResponse，非 JSON-RPC 协议错误（裁决 #9）
      const errorResult = this.makeErrorResult(err);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: errorResult,
      };
    }
  }

  // =========================================================================
  // 内部方法 — 工具调用
  // =========================================================================

  /** 无项目时返回结构化 ErrorResponse */
  private noProject(): ToolResult {
    return this.errorResult(
      ErrorCodes.INDEX_NOT_INITIALIZED,
      '索引尚未初始化，无可用数据。',
      '未找到 SQLite 索引。MCP 服务器已启动但从未调用 init。',
      '请在有 Markdown 文档的项目目录下运行 `md-graph init` 创建索引。',
      true,
    );
  }

  /** 将错误转为 content-level ErrorResponse（裁决 #9） */
  private makeErrorResult(err: unknown): ToolResult {
    if (err instanceof MdGraphError) {
      return this.errorResult(err.code, err.message, err.cause, err.fix, err.recoverable);
    }
    const message = err instanceof Error ? err.message : String(err);
    const code = message.includes('Missing required parameter')
      ? ErrorCodes.INVALID_PARAMETER
      : ErrorCodes.INTERNAL_ERROR;
    return this.errorResult(code, message, '', '', code === ErrorCodes.INVALID_PARAMETER);
  }

  /** 构建结构化 ErrorResponse */
  private errorResult(
    code: string,
    message: string,
    cause: string,
    fix: string,
    recoverable: boolean,
  ): ToolResult {
    const text = `${message}\n原因: ${cause}\n修复: ${fix}`;
    return {
      content: [{ type: 'text', text }],
      isError: true,
    };
  }

  /** 调用 md_status 工具 */
  private async callStatus(): Promise<ToolResult> {
    if (!this.graph) return this.noProject();
    const text = await this.graph.renderStatus();
    return {
      content: [{ type: 'text', text }],
    };
  }

  /** 调用 md_search 工具 */
  private async callSearch(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.graph) return this.noProject();
    const query = args.query as string | undefined;
    if (!query) {
      throw new Error('Missing required parameter: query');
    }

    const maxResults = (args.maxResults as number) ?? 10;
    const offset = (args.offset as number) ?? 0;
    const type = args.type as 'heading' | 'paragraph' | 'code_block' | undefined;
    const file = args.file as string | undefined;

    const text = await this.graph.renderSearch(query, { maxResults, offset, type, file });

    return {
      content: [{ type: 'text', text }],
    };
  }

  /** 调用 md_navigate 工具 */
  private async callNavigate(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.graph) return this.noProject();
    const nodeId = args.nodeId as number | undefined;
    const path = args.path as string | undefined;
    const direction = args.direction as string | undefined;

    if (nodeId === undefined && !path) {
      throw new Error('Missing required parameter: need nodeId or path');
    }
    if (!direction) {
      throw new Error('Missing required parameter: direction');
    }

    const depth = (args.depth as number) ?? 1;

    // 优先使用 path，fallback 到 nodeId
    const text = path
      ? await this.graph.renderNavigate(path, direction, depth)
      : await this.graph.renderNavigate(nodeId as number, direction, depth);

    return {
      content: [{ type: 'text', text }],
    };
  }
}

// =============================================================================
// stdioServer — stdio 传输层
// 通过 stdin/stdout 实现 MCP JSON-RPC 通信
// =============================================================================

/**
 * 使用 stdin/stdout 启动 MCP 服务器
 */
export function startStdioServer(graph: MdGraphFacade): void {
  const server = new McpServer(graph);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  process.stdin.on('data', (chunk: Uint8Array) => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        server.handleRequest(request).then((response: JsonRpcResponse) => {
          const output = JSON.stringify(response) + '\n';
          process.stdout.write(encoder.encode(output));
        }).catch((err: Error) => {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: -32603,
              message: `Unhandled error: ${err.message}`,
            },
          };
          process.stdout.write(encoder.encode(JSON.stringify(errorResponse) + '\n'));
        });
      } catch {
        // 忽略无法解析的 JSON
      }
    }
  });

  process.stdin.on('end', () => {
    server.close();
  });
}
