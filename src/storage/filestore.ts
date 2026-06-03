// =============================================================================
// FileStore — 文件系统存取模块
// 提供从文件系统按相对路径读取文档内容、递归扫描、哈希计算等功能
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// FileInfo — 文件元数据
// ---------------------------------------------------------------------------
export interface FileInfo {
  path: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
  status: 'active' | 'deleted';
  dbHasRecord: boolean;
}

// ---------------------------------------------------------------------------
// ExistsResult — 存在检查与统计信息
// ---------------------------------------------------------------------------
interface ExistsResult {
  exists: boolean;
  stats: fs.Stats | null;
}

// ---------------------------------------------------------------------------
// FileStore 类
// ---------------------------------------------------------------------------
export class FileStore {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  // -------------------------------------------------------------------------
  // read — 读取文件内容（UTF-8）
  // -------------------------------------------------------------------------
  async read(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    try {
      return await fs.promises.readFile(fullPath, 'utf-8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        throw new Error(`文件不存在: ${relativePath}`);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // glob — 递归文件扫描，支持 **/*.md 模式，忽略隐藏目录
  // -------------------------------------------------------------------------
  async glob(pattern: string): Promise<string[]> {
    // 只支持 **/*.ext 模式的简化实现
    const ext = pattern.replace(/\*\*\/\*/, '');
    const results: string[] = [];

    await this.walkDir(this.rootPath, '', results, ext);

    return results;
  }

  // -------------------------------------------------------------------------
  // stat — 同步文件状态
  // -------------------------------------------------------------------------
  stat(relativePath: string): fs.Stats {
    const fullPath = this.resolvePath(relativePath);
    try {
      return fs.statSync(fullPath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        throw new Error(`文件不存在: ${relativePath}`);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // exists — 同步存在检查
  // -------------------------------------------------------------------------
  exists(relativePath: string): boolean {
    const fullPath = this.resolvePath(relativePath);
    try {
      fs.accessSync(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // hash — SHA-256 哈希计算
  // -------------------------------------------------------------------------
  hash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  // -------------------------------------------------------------------------
  // getRelativePath — 绝对路径转相对路径
  // -------------------------------------------------------------------------
  getRelativePath(absolutePath: string): string {
    const rel = path.relative(this.rootPath, absolutePath);
    // 统一使用正斜杠
    return rel.replace(/\\/g, '/');
  }

  // -------------------------------------------------------------------------
  // 内部方法
  // -------------------------------------------------------------------------

  private resolvePath(relativePath: string): string {
    // 规范化并检查路径遍历
    const resolved = path.resolve(this.rootPath, relativePath);
    // 规范化 rootPath 确保比较准确
    const normalizedRoot = path.resolve(this.rootPath);
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      throw new Error(`路径越界: ${relativePath}`);
    }
    return resolved;
  }

  private async walkDir(
    dirPath: string,
    relativeDir: string,
    results: string[],
    ext: string,
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // 忽略隐藏文件和隐藏目录
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.walkDir(fullPath, relPath, results, ext);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(relPath);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
