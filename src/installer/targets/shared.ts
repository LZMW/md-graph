// =============================================================================
// shared.ts — 安装器共享工具函数
// 参照 CodeGraph installer/targets/shared.ts 的实现模式
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

/**
 * MCP 服务器配置块。
 * md-graph 通过 stdio 传输层提供 MCP 服务。
 */
export function getMcpServerConfig(): {
  type: string;
  command: string;
  args: string[];
} {
  return {
    type: 'stdio',
    command: 'md-graph',
    args: ['serve', '--mcp'],
  };
}

/**
 * md-graph 的 MCP 工具权限列表。
 * 用于 Claude Code 的 settings.json 权限白名单。
 */
export function getMdGraphPermissions(): string[] {
  return [
    'mcp__md-graph__md_status',
    'mcp__md-graph__md_search',
    'mcp__md-graph__md_navigate',
  ];
}

/**
 * 读取 JSON 文件，文件不存在或无法解析时返回 {}。
 *
 * 无法解析的文件会在返回 {} 前备份为 <path>.backup，
 * 防止幂等重写时静默删除用户现有配置。
 */
export function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  警告: 无法解析 ${path.basename(filePath)}: ${msg}`);
    console.warn(`  将在覆盖前创建备份文件。`);
    try {
      fs.copyFileSync(filePath, filePath + '.backup');
    } catch {
      // 备份失败不影响后续操作
    }
    return {};
  }
}

/**
 * 原子写入 JSON 文件：先写入临时文件再重命名。
 *
 * 防止写入过程中进程崩溃导致文件损坏。尾部追加换行符以保持 diff 友好。
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // 清理失败可忽略
    }
    throw err;
  }
}

/**
 * 原子写入 JSON 对象到文件。尾部追加换行符。
 */
export function writeJsonFile(
  filePath: string,
  data: Record<string, unknown>,
): void {
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * 深度比较两个 JSON 值，忽略键顺序。
 * 用于判断配置是否已是最新，避免不必要地重写文件。
 */
export function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonDeepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  if (!ak.every((k, i) => k === bk[i])) return false;
  return ak.every((k) => jsonDeepEqual(ao[k], bo[k]));
}
