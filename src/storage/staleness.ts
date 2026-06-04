// =============================================================================
// Staleness — stat-only 4 字段新鲜度检测
// 独立于 SqliteDbAdapter，在调用方（Searcher/Traverser/MdGraph）执行 fs.stat
// Gate 2 架构约束：DB 层不做 fs.stat
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import type { StalenessInfo } from '../types.js';

// ---------------------------------------------------------------------------
// 文件记录（来自 DB）
// ---------------------------------------------------------------------------
export interface FileStamp {
  path: string;
  size: number;
  mtimeMs: number;
  status: string;
}

// =============================================================================
// checkStaleness — 4 字段 stat-only 检测（裁决 #6）
// =============================================================================
export function checkStaleness(
  projectRoot: string,
  fileStamps: FileStamp[],
): StalenessInfo {
  const staleFiles: string[] = [];

  for (const stamp of fileStamps) {
    if (stamp.status !== 'active') continue;

    const absPath = path.resolve(projectRoot, stamp.path);

    // 字段 1: 文件是否在数据库中有记录 — 传入即代表有记录
    // 字段 2: 文件在文件系统中是否存在
    if (!fs.existsSync(absPath)) {
      staleFiles.push(stamp.path);
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(absPath);
    } catch {
      // 假阳性优先：stat 失败保守标记为 stale
      staleFiles.push(stamp.path);
      continue;
    }

    // 字段 3: 文件大小是否变化
    if (stat.size !== stamp.size) {
      staleFiles.push(stamp.path);
      continue;
    }

    // 字段 4: 修改时间是否变化
    if (stat.mtimeMs !== stamp.mtimeMs) {
      staleFiles.push(stamp.path);
      continue;
    }
  }

  return {
    stale: staleFiles.length > 0,
    staleFileCount: staleFiles.length,
    lastIndexedAt: fileStamps.length > 0
      ? '' // 由调用方填充
      : new Date(0).toISOString(),
  };
}

// =============================================================================
// mergeStaleness — 将 staleness 信息合并到已有 lastIndexedAt 的 info 中
// =============================================================================
export function mergeStaleness(
  staleInfo: StalenessInfo,
  lastIndexedAt: string,
): StalenessInfo {
  return {
    stale: staleInfo.stale,
    staleFileCount: staleInfo.staleFileCount,
    lastIndexedAt,
  };
}
