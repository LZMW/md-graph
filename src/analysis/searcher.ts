// =============================================================================
// Searcher — FTS5 全文搜索模块
// 提供格式化搜索结果 + snippet 生成 + 分数排序
// 依赖: SqliteDbAdapter
// =============================================================================
import { SqliteDbAdapter } from '../storage/database.js';
import { checkStaleness, mergeStaleness } from '../storage/staleness.js';
import type { SearchResult, SearchResultItem, SearchOptions } from '../types.js';

// =============================================================================
// Searcher
// =============================================================================
export class Searcher {
  private projectRoot: string;

  constructor(
    private readonly db: SqliteDbAdapter,
    projectRoot: string,
  ) {
    this.projectRoot = projectRoot;
  }

  // =========================================================================
  // search — 执行全文搜索
  // =========================================================================
  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    if (!query || !query.trim()) {
      const staleInfo = mergeStaleness(
        checkStaleness(this.projectRoot, this.db.getFileStamps()),
        this.db.getStaleInfo().lastIndexedAt,
      );
      return {
        totalResults: 0,
        results: [],
        stale: staleInfo.stale,
        staleFileCount: staleInfo.staleFileCount,
        lastIndexedAt: staleInfo.lastIndexedAt,
      };
    }

    const rows = this.db.searchFTS(query, {
      maxResults: options?.maxResults ?? 20,
      fileGlob: options?.fileGlob,
      type: options?.type,
      file: options?.file,
    });

    const results: SearchResultItem[] = rows.map((row) => {
      return {
        id: row.id,
        type: row.type as SearchResultItem['type'],
        fileId: row.file_id,
        filePath: row.path,
        fileName: this.extractFileName(row.path),
        lineStart: row.line_start,
        lineEnd: row.line_end,
        lineRanges: `${row.line_start}-${row.line_end}`,
        score: row.score,
        snippet: this.generateSnippet(row.content || '', query, 200),
        headingPath: row.heading_path || '',
        relatedDocCount: 0,
        stale: false,
      };
    });

    // 按 score 降序排序（searchFTS 已排序，做二次确认）
    results.sort((a, b) => b.score - a.score);

    const staleInfo = mergeStaleness(
      checkStaleness(this.projectRoot, this.db.getFileStamps()),
      this.db.getStaleInfo().lastIndexedAt,
    );

    return {
      totalResults: results.length,
      results,
      stale: staleInfo.stale,
      staleFileCount: staleInfo.staleFileCount,
      lastIndexedAt: staleInfo.lastIndexedAt,
    };
  }

  // =========================================================================
  // generateSnippet — 生成匹配上下文的摘要片段
  // 在匹配词周围提取上下文窗口中内容
  // =========================================================================
  generateSnippet(
    content: string,
    query: string,
    maxLength: number = 200,
  ): string {
    if (!content) return '';

    const q = query.toLowerCase().trim();
    const idx = content.toLowerCase().indexOf(q);

    if (idx === -1) {
      // 无匹配，返回截断内容
      return content.length <= maxLength ? content : content.slice(0, maxLength - 3) + '...';
    }

    // 在匹配词周围取上下文窗口
    const matchEnd = idx + q.length;
    const contextSize = Math.floor((maxLength - q.length) / 2);

    let start = Math.max(0, idx - contextSize);
    let end = Math.min(content.length, matchEnd + contextSize);

    // 如果 maxLength 够大，可能需要二次调整
    if (end - start > maxLength) {
      // 优先保留前面部分
      end = start + maxLength;
    }

    let snippet = content.slice(start, end);

    // 添加省略号
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** 从文件路径中提取文件名 */
  private extractFileName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
}
