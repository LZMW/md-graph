#!/usr/bin/env node
// =============================================================================
// CLI — 命令行接口
// 4 个命令: init / status / uninstall / serve / install
// 默认 JSON-only 输出
// 依赖: commander, MdGraph
// =============================================================================
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNearestMdGraphRoot } from './directory.js';

// 延迟导入（避免 ESM 循环问题和启动开销）
let MdGraphModule: typeof import('./md-graph.js') | null = null;
let McpServerModule: typeof import('./api/mcp-server.js') | null = null;
let InstallerModule: typeof import('./installer/index.js') | null = null;

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

async function getRunInstaller(): Promise<typeof import('./installer/index.js').runInstaller> {
  if (!InstallerModule) {
    InstallerModule = await import('./installer/index.js');
  }
  return InstallerModule.runInstaller;
}

// ---------------------------------------------------------------------------
// JSON 输出辅助
// ---------------------------------------------------------------------------
function jsonOutput(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// 命令处理函数（可测试）
// ---------------------------------------------------------------------------

export async function cmdInit(rootPath: string): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(rootPath);
  const storageDir = path.join(resolvedPath, '.md-graph');

  if (fs.existsSync(storageDir)) {
    return {
      success: false,
      message: `Repository already exists at ${resolvedPath}`,
    };
  }

  const Graph = await getMdGraph();
  const graph = new Graph(resolvedPath);
  await graph.init();
  await graph.close();

  return {
    success: true,
    message: `Initialized md-graph repository at ${resolvedPath}`,
    storageDir,
  };
}

export async function cmdStatus(rootPath: string): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(rootPath);
  const storageDir = path.join(resolvedPath, '.md-graph');

  if (!fs.existsSync(storageDir)) {
    return {
      success: false,
      message: 'Repository not initialized. Run "md-graph init" first.',
    };
  }

  const Graph = await getMdGraph();
  const graph = new Graph(resolvedPath);
  const status = await graph.status();
  await graph.close();

  return { success: true, ...status };
}

export async function cmdUninstall(rootPath: string): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(rootPath);
  const storageDir = path.join(resolvedPath, '.md-graph');

  if (!fs.existsSync(storageDir)) {
    return {
      success: false,
      message: 'No md-graph repository found.',
    };
  }

  fs.rmSync(storageDir, { recursive: true, force: true });

  return {
    success: true,
    message: `Removed md-graph storage at ${storageDir}`,
  };
}

// ---------------------------------------------------------------------------
// createCli — 创建 Commander 程序
// ---------------------------------------------------------------------------
export function createCli(): Command {
  const program = new Command();

  program
    .name('md-graph')
    .description('Markdown knowledge graph engine')
    .version('0.1.0')
    .exitOverride(); // 阻止 process.exit 以便测试

  // -------------------------------------------------------------------------
  // init — 初始化新仓库
  // -------------------------------------------------------------------------
  program
    .command('init')
    .description('Initialize a new md-graph repository')
    .argument('[dir]', 'Project root directory', '.')
    .action(async (dir: string) => {
      try {
        const result = await cmdInit(dir);
        process.stdout.write(jsonOutput(result) + '\n');
      } catch (err) {
        process.stderr.write(jsonOutput({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }) + '\n');
      }
    });

  // -------------------------------------------------------------------------
  // status — 显示索引状态
  // -------------------------------------------------------------------------
  program
    .command('status')
    .description('Show index status')
    .argument('[dir]', 'Project root directory', '.')
    .action(async (dir: string) => {
      try {
        const result = await cmdStatus(dir);
        process.stdout.write(jsonOutput(result) + '\n');
      } catch (err) {
        process.stderr.write(jsonOutput({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }) + '\n');
      }
    });

  // -------------------------------------------------------------------------
  // uninstall — 删除存储目录
  // -------------------------------------------------------------------------
  program
    .command('uninstall')
    .description('Remove md-graph storage directory')
    .argument('[dir]', 'Project root directory', '.')
    .action(async (dir: string) => {
      try {
        const result = await cmdUninstall(dir);
        process.stdout.write(jsonOutput(result) + '\n');
      } catch (err) {
        process.stderr.write(jsonOutput({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }) + '\n');
      }
    });

  // -------------------------------------------------------------------------
  // serve — 启动 MCP 服务器
  // -------------------------------------------------------------------------
  program
    .command('serve')
    .description('Start md-graph as an MCP server for AI assistants')
    .option('--mcp', 'Run as MCP server (stdio transport)')
    .option('--path <path>', 'Project root path')
    .action(async (options: { mcp?: boolean; path?: string }) => {
      try {
        if (options.mcp) {
          // 项目自动发现三层优先级：
          // 1. --path 显式指定  2. CLAUDE_PROJECT_DIR 环境变量  3. cwd 向上查找
          const projectRoot = options.path
            ? path.resolve(options.path)
            : (process.env.CLAUDE_PROJECT_DIR
              ? findNearestMdGraphRoot(process.env.CLAUDE_PROJECT_DIR)
              : findNearestMdGraphRoot(process.cwd()));

          if (!projectRoot) {
            process.stderr.write(JSON.stringify({
              success: false,
              error: 'No .md-graph project found. Run "md-graph init" first.',
            }) + '\n');
            process.exit(1);
          }

          const MdGraph = await getMdGraph();
          const graph = new MdGraph(projectRoot);
          await graph.init();

          const startStdioServer = await getStartStdioServer();
          // MdGraph 实现了 MdGraphFacade 的所有方法，类型差异仅在于
          // search() 返回的具体类型不同，使用 as any 安全转换
          startStdioServer(graph as any);
          // 服务器持续运行直到 stdin 关闭
        } else {
          process.stderr.write(JSON.stringify({
            success: false,
            message: 'Use --mcp flag to start the MCP server',
          }) + '\n');
        }
      } catch (err) {
        process.stderr.write(JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }) + '\n');
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // install — 安装 MCP 配置
  // -------------------------------------------------------------------------
  program
    .command('install')
    .description('Install md-graph MCP server into Claude Code')
    .option('-y, --yes', 'Non-interactive mode')
    .action(async () => {
      try {
        const runInstaller = await getRunInstaller();
        runInstaller();
      } catch (err) {
        process.stderr.write(JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }) + '\n');
        process.exit(1);
      }
    });

  return program;
}

// ---------------------------------------------------------------------------
// runCli — 运行 CLI（用于测试）
// ---------------------------------------------------------------------------
export async function runCli(
  argv: string[],
  cwd?: string,
): Promise<string> {
  const program = createCli();

  // 捕获 stdout
  const chunks: Buffer[] = [];
  const originalWrite = process.stdout.write;
  const originalCwd = process.cwd;

  process.stdout.write = ((chunk: unknown) => {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Buffer) {
      chunks.push(chunk);
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    }
    return true;
  }) as typeof process.stdout.write;

  if (cwd) {
    process.cwd = () => cwd;
  }

  try {
    await program.parseAsync(['node', 'cli-test', ...argv]);
  } finally {
    process.stdout.write = originalWrite;
    if (cwd) {
      process.cwd = originalCwd;
    }
  }

  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// main — CLI 入口函数
// 无参数时自动运行 MCP 安装器（参照 CodeGraph 模式: process.argv.length === 2）
// ---------------------------------------------------------------------------
export async function main(): Promise<void> {
  // 无参数时运行安装器（用户只需运行 `md-graph`）
  if (process.argv.length <= 2) {
    const runInstaller = await getRunInstaller();
    runInstaller();
    return;
  }

  const program = createCli();
  await program.parseAsync(process.argv);
}

// ---------------------------------------------------------------------------
// 自动执行：当此文件作为入口脚本直接运行时
// ---------------------------------------------------------------------------
const entryPath = process.argv[1];
if (entryPath) {
  const thisFile = fileURLToPath(import.meta.url);
  const normalizedEntry = path.resolve(entryPath);
  const normalizedThis = path.resolve(thisFile);
  if (normalizedEntry === normalizedThis) {
    main().catch((err) => {
      // Commander 的 exitOverride 在 --help/--version 时会抛出 CommanderError，
      // 这是预期行为，不视为错误
      if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).code === 'string') {
        const code = (err as Record<string, unknown>).code as string;
        if (code.startsWith('commander.')) {
          process.exit(0);
        }
      }
      console.error('md-graph: 未捕获的错误', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  }
}
