#!/usr/bin/env node
// =============================================================================
// MCP 入口 — MCP 服务器启动入口（独立于 CLI 排障命令集）
// Gate 2 裁决 A: serve 从 CLI 剥离到此文件
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNearestMdGraphRoot } from './directory.js';

// 延迟导入
let MdGraphModule: typeof import('./md-graph.js') | null = null;
let McpServerModule: typeof import('./api/mcp-server.js') | null = null;

async function getMdGraph(): Promise<typeof import('./md-graph.js').MdGraph> {
  if (!MdGraphModule) {
    MdGraphModule = await import('./md-graph.js');
  }
  return MdGraphModule.MdGraph;
}

async function getStartStdioServer(): Promise<typeof import('./api/mcp-server.js').startStdioServer> {
  if (!McpServerModule) {
    McpServerModule = await import('./api/mcp-server.js');
  }
  return McpServerModule.startStdioServer;
}

export async function serve(options: { path?: string }): Promise<void> {
  // 项目自动发现三层优先级：
  // 1. --path 显式指定  2. CLAUDE_PROJECT_DIR 环境变量  3. cwd 向上查找
  const projectRoot = options.path
    ? path.resolve(options.path)
    : (process.env.CLAUDE_PROJECT_DIR
      ? findNearestMdGraphRoot(process.env.CLAUDE_PROJECT_DIR)
      : findNearestMdGraphRoot(process.cwd()));

  const startStdioServer = await getStartStdioServer();
  if (projectRoot) {
    const MdGraph = await getMdGraph();
    const graph = new MdGraph(projectRoot, { autoWatch: true });
    await graph.init();
    startStdioServer(graph as any);
  } else {
    process.stderr.write(JSON.stringify({
      ok: false,
      error: 'No .md-graph project found. Run "md-graph init" first.',
    }) + '\n');
    startStdioServer(null as any);
  }
}

// 直接运行时启动
const entryPath = process.argv[1];
if (entryPath) {
  const thisFile = fileURLToPath(import.meta.url);
  const normalizedEntry = path.resolve(entryPath);
  const normalizedThis = path.resolve(thisFile);
  if (normalizedEntry === normalizedThis) {
    serve({}).catch((err) => {
      process.stderr.write(JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n');
      process.exit(1);
    });
  }
}
