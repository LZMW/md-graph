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
  // generateSnippet — 匹配词居中 ±80 字符，句边界对齐
  // 原则：snippet 是相关性证据，不是内容预览
  // =========================================================================
  generateSnippet(
    content: string,
    query: string,
    maxLength: number = 160,
  ): string {
    if (!content) return '';

    const q = query.toLowerCase().trim();
    const idx = content.toLowerCase().indexOf(q);

    if (idx === -1) {
      return content.length <= maxLength ? content : content.slice(0, maxLength);
    }

    const matchEnd = idx + q.length;
    const margin = Math.floor((maxLength - q.length) / 2);

    let start = Math.max(0, idx - margin);
    let end = Math.min(content.length, matchEnd + margin);

    // 句边界对齐：在 start 和 end 附近找最近的句子分隔符
    const SENTENCE_BOUNDARY = /[。！？.!?\n]/g;
    const snapWindow = 20;

    // start 向前对齐到句边界（在 snapWindow 内）
    for (let i = start; i < Math.min(start + snapWindow, idx); i++) {
      if (SENTENCE_BOUNDARY.test(content[i])) { start = i + 1; break; }
    }
    // end 向后对齐到句边界
    for (let i = end; i > Math.max(end - snapWindow, matchEnd); i--) {
      if (SENTENCE_BOUNDARY.test(content[i])) { end = i + 1; break; }
    }

    let snippet = content.slice(start, end);

    // 回退到词边界：避免从单词中间截断
    const WORD_BOUNDARY = /[\s,;:(){}[\]<>"'`]/;
    if (start > 0 && !WORD_BOUNDARY.test(snippet[0] || '')) {
      const firstSpace = snippet.search(/[\s,;:]/);
      if (firstSpace > 0 && firstSpace < 10) snippet = snippet.slice(firstSpace);
    }
    if (end < content.length && !WORD_BOUNDARY.test(snippet[snippet.length - 1] || '')) {
      const lastSpace = snippet.search(/[\s,;:]$/);
      if (lastSpace < 0) {
        // 向前找最近的词边界
        for (let i = snippet.length - 1; i > snippet.length - 10; i--) {
          if (WORD_BOUNDARY.test(snippet[i])) { snippet = snippet.slice(0, i); break; }
        }
      }
    }

    snippet = snippet.trim();

    // 只在真正截断时加 …
    if (start > 0) snippet = '…' + snippet;
    if (end < content.length) snippet = snippet + '…';

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
