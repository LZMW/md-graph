// =============================================================================
// MCP Server — TDD 测试
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

let McpServer: typeof import('./mcp-server.js').McpServer;
let createServerInstructions: typeof import('./server-instructions.js').createServerInstructions;

before(async () => {
  McpServer = (await import('./mcp-server.js')).McpServer;
  createServerInstructions = (await import('./server-instructions.js')).createServerInstructions;
});

describe('McpServer', () => {
  let server: InstanceType<typeof McpServer>;

  // 创建一个 mock MdGraph
  const mockGraph = {
    status: async () => ({
      totalFiles: 10,
      totalNodes: 100,
      totalEdges: 50,
      lastIndexedAt: '2026-01-01T00:00:00Z',
      stale: false,
      staleFileCount: 0,
    }),
    search: async () => ({
      totalResults: 2,
      results: [
        { id: 1, filePath: 'docs/test.md', headingPath: 'Intro', snippet: 'Hello', score: 1.5 } as any,
      ],
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '2026-01-01T00:00:00Z',
    }),
    navigate: async () => ({
      sourceNodeId: 1,
      sourcePath: 'docs/test.md',
      topic: 'Test',
      direction: 'outbound' as const,
      depth: 1,
      totalLinks: 1,
      links: [
        { targetPath: 'docs/other.md', linkText: 'Other', status: 'resolved' } as any,
      ],
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '2026-01-01T00:00:00Z',
      tookMs: 5,
      sourceFileId: 1,
      sourceFileName: 'test.md',
    }),
    close: async () => {},
  };

  after(() => {
    if (server) server.close();
  });

  it('constructor — 应使用 MdGraph 创建 McpServer', () => {
    server = new McpServer(mockGraph as any);
    assert.ok(server instanceof McpServer);
  });

  it('handleRequest — initialize 应返回协议版本', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '0.1.0',
        capabilities: { tools: {} },
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });
    assert.ok(response);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    const initResult = response.result as any;
    assert.ok(initResult.protocolVersion);
    assert.ok(initResult.capabilities?.tools);
  });

  it('handleRequest — tools/list 应返回工具列表', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    assert.ok(response);
    assert.equal(response.jsonrpc, '2.0');
    const listResult = response.result as any;
    assert.ok(Array.isArray(listResult.tools));
    assert.ok(listResult.tools.length >= 3);
    const toolNames = listResult.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('md_status'));
    assert.ok(toolNames.includes('md_search'));
    assert.ok(toolNames.includes('md_navigate'));
  });

  it('handleRequest — tools/call md_status 应返回状态', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'md_status', arguments: {} },
    });
    assert.ok(response);
    assert.equal(response.jsonrpc, '2.0');
    const callResult = response.result as any;
    assert.ok(callResult.content);
    assert.ok(Array.isArray(callResult.content));
    assert.equal(callResult.content[0]?.type, 'text');
  });

  it('handleRequest — tools/call md_search 应返回搜索结果', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'md_search', arguments: { query: 'hello' } },
    });
    assert.ok(response);
    assert.equal(response.jsonrpc, '2.0');
    const callResult = response.result as any;
    assert.ok(callResult.content);
    assert.ok(Array.isArray(callResult.content));
    assert.equal(callResult.content[0]?.type, 'text');
  });

  it('handleRequest — tools/call md_search 缺少参数应返回错误', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'md_search', arguments: {} },
    });
    assert.ok(response);
    assert.ok(response.error);
    assert.equal(response.error?.code, -32602);
  });

  it('handleRequest — 未知方法应返回错误', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'unknown_method',
    });
    assert.ok(response);
    assert.ok(response.error);
    assert.equal(response.error?.code, -32601);
  });
});

describe('createServerInstructions', () => {
  it('应生成包含 3 个工具的说明文本', () => {
    const instructions = createServerInstructions();
    assert.ok(instructions.includes('md_status'));
    assert.ok(instructions.includes('md_search'));
    assert.ok(instructions.includes('md_navigate'));
    assert.ok(instructions.length > 100);
  });
});
