// =============================================================================
// CLI — 命令行接口
// 3 个命令: init / status / uninstall
// 默认 JSON-only 输出
// 依赖: commander, MdGraph
// =============================================================================
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

// 延迟导入 MdGraph（避免 ESM 循环问题）
let MdGraph: typeof import('./md-graph.js').MdGraph | null = null;

async function getMdGraph(): Promise<typeof import('./md-graph.js').MdGraph> {
  if (!MdGraph) {
    MdGraph = (await import('./md-graph.js')).MdGraph;
  }
  return MdGraph;
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
// ---------------------------------------------------------------------------
export async function main(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
