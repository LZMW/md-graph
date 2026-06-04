// =============================================================================
// directory.ts — .md-graph 目录自动发现
// 从指定路径向上遍历，找到最近包含 .md-graph/ 的根目录
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

/**
 * .md-graph 目录名
 */
export const MD_GRAPH_DIR = '.md-graph';

/**
 * 获取项目 .md-graph 目录的完整路径
 */
export function getMdGraphDir(projectRoot: string): string {
  return path.join(projectRoot, MD_GRAPH_DIR);
}

/**
 * 检查项目是否已初始化（.md-graph 目录存在）
 */
export function isInitialized(projectRoot: string): boolean {
  const dir = getMdGraphDir(projectRoot);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

/**
 * 从 startPath 向上遍历，查找最近的包含 .md-graph/ 的根目录。
 *
 * 类似 git 查找 .git/ 目录的方式。
 *
 * @param startPath - 开始搜索的目录路径
 * @returns 包含 .md-graph/ 的项目根目录，未找到返回 null
 */
export function findNearestMdGraphRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (isInitialized(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 检查根目录
  if (isInitialized(current)) {
    return current;
  }

  return null;
}
