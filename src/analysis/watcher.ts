// =============================================================================
// FileWatcher — 文件系统监控模块
// 基于 chokidar 的文件变更监控 + debounce + pending set
// 文件变更 → 触发增量索引
// 依赖: Indexer
// =============================================================================
import { watch, FSWatcher as ChokidarFSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import type { IndexResult } from '../types.js';

// ---------------------------------------------------------------------------
// StalenessRecord — 用于 staleness 检测的记录类型
// ---------------------------------------------------------------------------
export interface StalenessRecord {
  path: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// WatcherOptions
// ---------------------------------------------------------------------------
export interface WatcherOptions {
  debounceMs?: number; // debounce 间隔，默认 300ms
  ignored?: string[];  // 忽略的文件模式
}

// =============================================================================
// Watcher — 文件系统监控
// =============================================================================
export class Watcher {
  private readonly rootPath: string;
  private readonly indexer: { incrementalIndex(rootPath?: string): Promise<IndexResult> };
  private readonly debounceMs: number;
  private readonly pendingFiles: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watcher: ChokidarFSWatcher | null = null;

  constructor(
    rootPath: string,
    indexer: { incrementalIndex(rootPath?: string): Promise<IndexResult> },
    options?: WatcherOptions,
  ) {
    this.rootPath = rootPath;
    this.indexer = indexer;
    this.debounceMs = options?.debounceMs ?? 300;
  }

  // =========================================================================
  // start — 启动文件监控
  // =========================================================================
  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.rootPath, {
      ignored: /(^|[/\\])\.(?!md$)/, // 忽略非 .md 文件的隐藏文件和目录
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath: string) => this.handleChange(filePath));
    this.watcher.on('change', (filePath: string) => this.handleChange(filePath));
    this.watcher.on('unlink', (filePath: string) => this.handleChange(filePath));
  }

  // =========================================================================
  // close — 停止监控
  // =========================================================================
  close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.pendingFiles.clear();
  }

  // =========================================================================
  // stalenessCheck —  stat-only 过时检测（4 字段判定）
  // 判断 DB 中的记录是否与当前文件系统状态一致
  // =========================================================================
  stalenessCheck(
    filePath: string,
    dbRecord: StalenessRecord,
  ): boolean {
    try {
      const stats = fs.statSync(filePath);
      // 4 字段判定：path, size, mtimeMs, contentHash
      // path 已在调用层保证匹配
      if (stats.size !== dbRecord.size) return true;
      if (stats.mtimeMs !== dbRecord.mtimeMs) return true;
      // contentHash 无法从 stat 获取，跳过 stat-only 检测
      return false;
    } catch {
      // 文件不存在 → stale
      return true;
    }
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** 判断是否为 .md 或 .mdx 文件 */
  private isMdFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.mdx';
  }

  /** 处理文件变更事件 */
  private handleChange(filePath: string): void {
    if (!this.isMdFile(filePath)) return;

    this.pendingFiles.add(filePath);
    this.scheduleFlush();
  }

  /** 供测试用的内部方法暴露 */
  private onFileChange(filePath: string): void {
    this.handleChange(filePath);
  }

  /** 调度 debounce flush */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  /** 执行批量索引 */
  private async flush(): Promise<void> {
    this.debounceTimer = null;

    if (this.pendingFiles.size === 0) return;

    try {
      await this.indexer.incrementalIndex(this.rootPath);
    } catch {
      // 索引失败不阻塞监控
    } finally {
      this.pendingFiles.clear();
    }
  }
}
