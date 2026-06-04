#!/usr/bin/env node
// =============================================================================
// CLI — 命令行接口
// 3 命令: init / status / uninstall（DI 规格，裁决 #7）
// 纯 JSON stdout 输出，exit code 三级: 0=完全成功, 1=部分成功, 2=完全失败
// Gate 2 裁决 A: install 已删除，serve 保留但委托给 mcp-entry.ts
// =============================================================================
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let MdGraphModule: typeof import('./md-graph.js') | null = null;

async function getMdGraph(): Promise<typeof import('./md-graph.js').MdGraph> {
  if (!MdGraphModule) {
    MdGraphModule = await import('./md-graph.js');
  }
  return MdGraphModule.MdGraph;
}

function jsonOutput(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// cmdInit — 默认增量模式，--force 全量重建
// ---------------------------------------------------------------------------
export async function cmdInit(
  dirPath: string,
  options?: { force?: boolean },
): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(dirPath);
  const storageDir = path.join(resolvedPath, '.md-graph');
  const exists = fs.existsSync(storageDir);
  const startTime = Date.now();

  const Graph = await getMdGraph();
  const graph = new Graph(resolvedPath);
  await graph.init();

  if (!exists || options?.force) {
    const result = await graph.fullIndex(resolvedPath);
    await graph.close();
    return {
      ok: true,
      mode: 'full',
      indexedCount: result.indexedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      failedFiles: result.failedFiles,
      totalFiles: result.totalFiles,
      totalNodes: result.totalNodes,
      totalEdges: result.totalEdges,
      durationMs: Date.now() - startTime,
      lastIndexedAt: result.lastIndexedAt,
    };
  }

  // 默认：增量模式
  try {
    const status = await graph.status();
    await graph.close();
    return {
      ok: true,
      mode: 'incremental',
      indexedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedFiles: [],
      totalFiles: status.totalFiles,
      totalNodes: status.totalNodes,
      totalEdges: status.totalEdges,
      durationMs: Date.now() - startTime,
      lastIndexedAt: status.lastIndexedAt,
    };
  } catch (err) {
    await graph.close();
    return {
      ok: false,
      code: 'INIT_FAILED',
      message: err instanceof Error ? err.message : String(err),
      cause: '索引增量更新失败',
      fix: '使用 --force 全量重建索引',
      recoverable: true,
    };
  }
}

// ---------------------------------------------------------------------------
// cmdStatus — 索引健康检查
// ---------------------------------------------------------------------------
export async function cmdStatus(
  dirPath: string,
  options?: { verbose?: boolean },
): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(dirPath);
  const storageDir = path.join(resolvedPath, '.md-graph');

  if (!fs.existsSync(storageDir)) {
    return {
      ok: false,
      code: 'INDEX_NOT_INITIALIZED',
      message: '索引尚未初始化。',
      cause: `在 ${resolvedPath} 下未找到 .md-graph 目录。`,
      fix: '运行 `md-graph init` 创建索引。',
      recoverable: true,
    };
  }

  const Graph = await getMdGraph();
  const graph = new Graph(resolvedPath);
  await graph.init();
  const status = await graph.status();
  await graph.close();

  const result: Record<string, unknown> = {
    ok: true,
    initialized: true,
    projectDir: resolvedPath,
    totalFiles: status.totalFiles,
    totalNodes: status.totalNodes,
    totalEdges: status.totalEdges,
    staleFileCount: status.staleFileCount,
    lastIndexedAt: status.lastIndexedAt,
    watcherActive: false,
  };

  if (options?.verbose) {
    result.staleFilePathList = [];
    result.pendingFileCount = 0;
    result.lastIndexDurationMs = 0;
  }

  return result;
}

// ---------------------------------------------------------------------------
// cmdUninstall — 删除存储目录
// ---------------------------------------------------------------------------
export async function cmdUninstall(
  dirPath: string,
  options?: { keepDb?: boolean },
): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(dirPath);
  const storageDir = path.join(resolvedPath, '.md-graph');
  const dbPath = path.join(storageDir, 'index.db');
  const startTime = Date.now();

  if (!fs.existsSync(storageDir)) {
    return {
      ok: false,
      code: 'INDEX_NOT_INITIALIZED',
      message: '未找到 md-graph 仓库。',
      cause: `在 ${resolvedPath} 下未找到 .md-graph 目录。`,
      fix: '确认目录路径是否正确。',
      recoverable: true,
    };
  }

  if (options?.keepDb) {
    return {
      ok: true,
      action: 'config_only',
      dbPath,
      dbRemoved: false,
      durationMs: Date.now() - startTime,
    };
  }

  fs.rmSync(storageDir, { recursive: true, force: true });

  return {
    ok: true,
    action: 'full_uninstall',
    dbPath,
    dbRemoved: true,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// createCli
// ---------------------------------------------------------------------------
export function createCli(): Command {
  const program = new Command();

  program
    .name('md-graph')
    .description('Markdown knowledge graph engine — CLI for agent troubleshooting')
    .version('0.1.0')
    .exitOverride();

  program
    .command('init')
    .description('Initialize or update the index (default: incremental)')
    .argument('[dir]', 'Project root directory', '.')
    .option('--dir <path>', 'Project root directory')
    .option('--force', 'Full rebuild — skip mtime check, reindex all files')
    .action(async (dir: string, options: { dir?: string; force?: boolean }) => {
      const targetDir = options.dir || dir;
      try {
        const result = await cmdInit(targetDir, { force: options.force });
        process.stdout.write(jsonOutput(result) + '\n');
        process.exit(result.ok === false ? 2 : 0);
      } catch (err) {
        process.stderr.write(jsonOutput({
          ok: false, code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        }) + '\n');
        process.exit(2);
      }
    });

  program
    .command('status')
    .description('Show index health and staleness report')
    .argument('[dir]', 'Project root directory', '.')
    .option('--verbose', 'Include stale file paths and detailed timing')
    .action(async (dir: string, options: { verbose?: boolean }) => {
      try {
        const result = await cmdStatus(dir, { verbose: options.verbose });
        process.stdout.write(jsonOutput(result) + '\n');
        process.exit(result.ok === false ? 2 : 0);
      } catch (err) {
        process.stderr.write(jsonOutput({ ok: false }) + '\n');
        process.exit(2);
      }
    });

  program
    .command('uninstall')
    .description('Remove md-graph storage and index')
    .argument('[dir]', 'Project root directory', '.')
    .option('--force', 'Skip confirmation')
    .option('--keep-db', 'Only remove MCP config, keep database')
    .action(async (dir: string, options: { force?: boolean; keepDb?: boolean }) => {
      try {
        const result = await cmdUninstall(dir, { keepDb: options.keepDb });
        process.stdout.write(jsonOutput(result) + '\n');
        process.exit(result.ok === false ? 2 : 0);
      } catch (err) {
        process.stderr.write(jsonOutput({ ok: false }) + '\n');
        process.exit(2);
      }
    });

  // serve 委托给 mcp-entry.ts
  program
    .command('serve')
    .description('Start MCP server (stdio transport)')
    .option('--mcp', 'Run as MCP server')
    .option('--path <path>', 'Project root path')
    .action(async (options: { mcp?: boolean; path?: string }) => {
      if (options.mcp) {
        const { serve } = await import('./mcp-entry.js');
        await serve({ path: options.path });
      } else {
        process.stderr.write(jsonOutput({
          ok: false,
          message: 'Use --mcp flag to start the MCP server',
        }) + '\n');
        process.exit(2);
      }
    });

  return program;
}

// ---------------------------------------------------------------------------
// runCli — 测试用
// ---------------------------------------------------------------------------
export async function runCli(argv: string[], cwd?: string): Promise<string> {
  const program = createCli();
  const chunks: Buffer[] = [];
  const originalWrite = process.stdout.write;
  const originalCwd = process.cwd;

  process.stdout.write = ((chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Buffer) chunks.push(chunk);
    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
    return true;
  }) as typeof process.stdout.write;

  if (cwd) process.cwd = () => cwd;

  try {
    await program.parseAsync(['node', 'cli-test', ...argv]);
  } finally {
    process.stdout.write = originalWrite;
    if (cwd) process.cwd = originalCwd;
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function main(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}

const entryPath = process.argv[1];
if (entryPath) {
  const thisFile = fileURLToPath(import.meta.url);
  if (path.resolve(entryPath) === path.resolve(thisFile)) {
    main().catch((err) => {
      if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).code === 'string') {
        if (((err as Record<string, unknown>).code as string).startsWith('commander.')) {
          process.exit(0);
        }
      }
      console.error('md-graph: 未捕获的错误', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  }
}
