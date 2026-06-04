// =============================================================================
// SqliteDbAdapter — better-sqlite3 数据库封装
// 提供 files/doc_nodes/doc_node_content/edges 表的完整 CRUD 操作、
// FTS5 搜索、BFS 递归导航和有效期检测
// =============================================================================
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FileInsert,
  FileRecord,
  FileTreeNode,
  NodeInsert,
  NodeRecord,
  EdgeInsert,
  EdgeRecord,
  ChangeItem,
  Batch,
  ChangeBatchResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// 内部类型（DB 层专用，不泄漏到公共 API）
// ---------------------------------------------------------------------------

export interface SearchOptions {
  maxResults?: number;   // default: 10, max: 50
  offset?: number;       // default: 0
  fileGlob?: string;     // 文件路径 glob 过滤
  type?: 'heading' | 'paragraph' | 'code_block';
  file?: string;         // 按文件路径精确过滤
}

export interface SearchResultRow {
  id: number;
  type: string;
  file_id: number;
  path: string;
  line_start: number;
  line_end: number;
  content: string;
  heading_path: string;
  score: number;
}

export interface StaleInfo {
  stale: boolean;
  staleFileCount: number;
  lastIndexedAt: string;
}

export interface IndexStatus {
  totalFiles: number;
  totalNodes: number;
  totalEdges: number;
}

export interface ChangedFileRecord {
  id: number;
  path: string;
  indexed_at: string;
  last_change_details: string | null;
}

// ---------------------------------------------------------------------------
// SqliteDbAdapter
// ---------------------------------------------------------------------------

export class SqliteDbAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath === ':memory:') {
      this.db = new Database(':memory:');
    } else {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(dbPath);
    }

    // PRAGMA 配置
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // 执行 schema.sql
    this.executeSchema();
  }

  close(): void {
    this.db.close();
  }

  // =========================================================================
  // files 表 CRUD
  // =========================================================================

  insertFile(fileData: FileInsert): { id: number } {
    const stmt = this.db.prepare(`
      INSERT INTO files (path, content_hash, size, mtime_ms, status)
      VALUES (@path, @content_hash, @size, @mtime_ms, @status)
    `);
    const result = stmt.run({
      path: fileData.path,
      content_hash: fileData.content_hash,
      size: fileData.size,
      mtime_ms: fileData.mtime_ms,
      status: fileData.status ?? 'active',
    });
    return { id: Number(result.lastInsertRowid) };
  }

  updateFile(id: number, data: Partial<FileInsert & { last_change_details: string | null; node_count: number; indexed_at: string }>): void {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        // 将 camelCase 转为 snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${snakeKey} = @${snakeKey}`);
        values[snakeKey] = value;
      }
    }

    if (fields.length === 0) return;

    const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(values);
  }

  deleteFile(fileId: number): void {
    this.db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  }

  getFileByPath(path: string): FileRecord | undefined {
    return this.db.prepare('SELECT * FROM files WHERE path = ?').get(path) as FileRecord | undefined;
  }

  getAllFiles(): FileRecord[] {
    return this.db.prepare('SELECT * FROM files').all() as FileRecord[];
  }

  getFileCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    return row.count;
  }

  getFilesByStatus(status: 'active' | 'deleted'): FileRecord[] {
    return this.db.prepare('SELECT * FROM files WHERE status = ?').all(status) as FileRecord[];
  }

  // =========================================================================
  // doc_nodes 表 CRUD
  // =========================================================================

  insertNode(nodeData: NodeInsert): { id: number } {
    const stmt = this.db.prepare(`
      INSERT INTO doc_nodes (file_id, type, line_start, line_end, col_start, col_end,
                             searchable, parent_id, ordinal, heading_level, heading_path, line_ranges, inline_tokens)
      VALUES (@file_id, @type, @line_start, @line_end, @col_start, @col_end,
              @searchable, @parent_id, @ordinal, @heading_level, @heading_path, @line_ranges, @inline_tokens)
    `);
    const result = stmt.run({
      file_id: nodeData.file_id,
      type: nodeData.type,
      line_start: nodeData.line_start,
      line_end: nodeData.line_end,
      col_start: nodeData.col_start,
      col_end: nodeData.col_end,
      searchable: nodeData.searchable ?? 0,
      parent_id: nodeData.parent_id ?? null,
      ordinal: nodeData.ordinal,
      heading_level: nodeData.heading_level ?? null,
      heading_path: nodeData.heading_path ?? null,
      line_ranges: nodeData.line_ranges ?? null,
      inline_tokens: nodeData.inline_tokens ?? null,
    });
    return { id: Number(result.lastInsertRowid) };
  }

  insertNodes(nodes: NodeInsert[]): number[] {
    const stmt = this.db.prepare(`
      INSERT INTO doc_nodes (file_id, type, line_start, line_end, col_start, col_end,
                             searchable, parent_id, ordinal, heading_level, heading_path, line_ranges, inline_tokens)
      VALUES (@file_id, @type, @line_start, @line_end, @col_start, @col_end,
              @searchable, @parent_id, @ordinal, @heading_level, @heading_path, @line_ranges, @inline_tokens)
    `);

    const ids: number[] = [];
    const insertMany = this.db.transaction((items: NodeInsert[]) => {
      for (const item of items) {
        const result = stmt.run({
          file_id: item.file_id,
          type: item.type,
          line_start: item.line_start,
          line_end: item.line_end,
          col_start: item.col_start,
          col_end: item.col_end,
          searchable: item.searchable ?? 0,
          parent_id: item.parent_id ?? null,
          ordinal: item.ordinal,
          heading_level: item.heading_level ?? null,
          heading_path: item.heading_path ?? null,
          line_ranges: item.line_ranges ?? null,
          inline_tokens: item.inline_tokens ?? null,
        });
        ids.push(Number(result.lastInsertRowid));
      }
    });

    insertMany(nodes);
    return ids;
  }

  deleteNodesByFile(fileId: number): void {
    this.db.prepare('DELETE FROM doc_nodes WHERE file_id = ?').run(fileId);
  }

  getNodeById(id: number): NodeRecord | undefined {
    return this.db.prepare('SELECT * FROM doc_nodes WHERE id = ?').get(id) as NodeRecord | undefined;
  }

  getNodesByFile(fileId: number): NodeRecord[] {
    return this.db.prepare('SELECT * FROM doc_nodes WHERE file_id = ? ORDER BY ordinal').all(fileId) as NodeRecord[];
  }

  getNodeCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM doc_nodes').get() as { count: number };
    return row.count;
  }

  // =========================================================================
  // doc_node_content 表操作
  // =========================================================================

  insertContent(nodeId: number, content: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO doc_node_content (node_id, content)
      VALUES (?, ?)
    `).run(nodeId, content);
  }

  deleteContent(nodeId: number): void {
    this.db.prepare('DELETE FROM doc_node_content WHERE node_id = ?').run(nodeId);
  }

  getContent(nodeId: number): string | undefined {
    const row = this.db.prepare('SELECT content FROM doc_node_content WHERE node_id = ?').get(nodeId) as { content: string } | undefined;
    return row?.content;
  }

  // =========================================================================
  // edges 表 CRUD
  // =========================================================================

  insertEdge(edgeData: EdgeInsert): { id: number } {
    const stmt = this.db.prepare(`
      INSERT INTO edges (source_node_id, target_node_id, raw_href, link_text, line, col, status)
      VALUES (@source_node_id, @target_node_id, @raw_href, @link_text, @line, @col, @status)
    `);
    const result = stmt.run({
      source_node_id: edgeData.source_node_id,
      target_node_id: edgeData.target_node_id ?? null,
      raw_href: edgeData.raw_href,
      link_text: edgeData.link_text ?? null,
      line: edgeData.line ?? null,
      col: edgeData.col ?? null,
      status: edgeData.status ?? 'resolved',
    });
    return { id: Number(result.lastInsertRowid) };
  }

  insertEdges(edges: EdgeInsert[]): number[] {
    const stmt = this.db.prepare(`
      INSERT INTO edges (source_node_id, target_node_id, raw_href, link_text, line, col, status)
      VALUES (@source_node_id, @target_node_id, @raw_href, @link_text, @line, @col, @status)
    `);

    const ids: number[] = [];
    const insertMany = this.db.transaction((items: EdgeInsert[]) => {
      for (const item of items) {
        const result = stmt.run({
          source_node_id: item.source_node_id,
          target_node_id: item.target_node_id ?? null,
          raw_href: item.raw_href,
          link_text: item.link_text ?? null,
          line: item.line ?? null,
          col: item.col ?? null,
          status: item.status ?? 'resolved',
        });
        ids.push(Number(result.lastInsertRowid));
      }
    });

    insertMany(edges);
    return ids;
  }

  deleteEdgesByFile(fileId: number): void {
    // edges 通过 doc_nodes ON DELETE CASCADE 删除，本方法显式删除
    this.db.prepare(`
      DELETE FROM edges WHERE source_node_id IN (
        SELECT id FROM doc_nodes WHERE file_id = ?
      )
    `).run(fileId);
  }

  getEdgesBySourceNode(nodeId: number): EdgeRecord[] {
    return this.db.prepare('SELECT * FROM edges WHERE source_node_id = ?').all(nodeId) as EdgeRecord[];
  }

  getEdgesByTargetNode(nodeId: number): EdgeRecord[] {
    return this.db.prepare('SELECT * FROM edges WHERE target_node_id = ?').all(nodeId) as EdgeRecord[];
  }

  getEdgeCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as { count: number };
    return row.count;
  }

  getBrokenLinks(): EdgeRecord[] {
    return this.db.prepare("SELECT * FROM edges WHERE status = 'broken'").all() as EdgeRecord[];
  }

  // =========================================================================
  // 搜索
  // =========================================================================

  searchFTS(query: string, options: SearchOptions): SearchResultRow[] {
    const maxResults = Math.min(options.maxResults ?? 10, 50);
    const offset = options.offset ?? 0;

    // 安全处理查询词：移除特殊字符
    const safeQuery = query.replace(/[^\w\s一-鿿-]/g, ' ').trim();
    if (!safeQuery) return [];

    let sql = `
      SELECT
        n.id,
        n.type,
        n.file_id,
        f.path,
        n.line_start,
        n.line_end,
        c.content,
        n.heading_path,
        rank AS score
      FROM nodes_fts
      JOIN doc_node_content c ON nodes_fts.rowid = c.node_id
      JOIN doc_nodes n ON c.node_id = n.id
      JOIN files f ON n.file_id = f.id
      WHERE nodes_fts MATCH ?
    `;

    const params: unknown[] = [safeQuery];

    if (options.fileGlob) {
      // 将 glob 模式转为 SQL LIKE
      const likePattern = options.fileGlob.replace(/\*/g, '%').replace(/\?/g, '_');
      sql += ' AND f.path LIKE ?';
      params.push(likePattern);
    }

    if (options.file) {
      sql += ' AND f.path = ?';
      params.push(options.file);
    }

    if (options.type) {
      sql += ' AND n.type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY rank LIMIT ? OFFSET ?';
    params.push(maxResults, offset);

    return this.db.prepare(sql).all(...params) as SearchResultRow[];
  }

  // =========================================================================
  // 导航
  // =========================================================================

  getBFSOutbound(nodeIds: number[], maxDepth: number): EdgeRecord[] {
    if (nodeIds.length === 0 || maxDepth < 1) return [];

    const seen = new Set<number>();
    const results: EdgeRecord[] = [];

    // BFS 使用递归 CTE
    const sql = `
      WITH RECURSIVE bfs AS (
        SELECT e.*, 1 AS depth
        FROM edges e
        WHERE e.source_node_id IN (${nodeIds.map(() => '?').join(',')})
        UNION
        SELECT e.*, bfs.depth + 1
        FROM edges e
        JOIN bfs ON e.source_node_id = bfs.target_node_id
        WHERE bfs.depth < ? AND e.target_node_id IS NOT NULL
      )
      SELECT DISTINCT * FROM bfs ORDER BY depth, id
    `;

    const rows = this.db.prepare(sql).all(...nodeIds, maxDepth) as (EdgeRecord & { depth: number })[];
    return rows;
  }

  getBFSInbound(nodeIds: number[], maxDepth: number): EdgeRecord[] {
    if (nodeIds.length === 0 || maxDepth < 1) return [];

    const sql = `
      WITH RECURSIVE bfs AS (
        SELECT e.*, 1 AS depth
        FROM edges e
        WHERE e.target_node_id IN (${nodeIds.map(() => '?').join(',')})
        UNION
        SELECT e.*, bfs.depth + 1
        FROM edges e
        JOIN bfs ON e.target_node_id = bfs.source_node_id
        WHERE bfs.depth < ? AND e.target_node_id IS NOT NULL
      )
      SELECT DISTINCT * FROM bfs ORDER BY depth, id
    `;

    const rows = this.db.prepare(sql).all(...nodeIds, maxDepth) as (EdgeRecord & { depth: number })[];
    return rows;
  }

  // =========================================================================
  // 状态信息
  // =========================================================================

  getStaleInfo(): StaleInfo {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
        COALESCE(MAX(indexed_at), '1970-01-01T00:00:00Z') AS last_indexed
      FROM files
    `).get() as { total: number; active_count: number; last_indexed: string };

    return {
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: row.last_indexed,
    };
  }

  /** 获取所有 active 文件的时间戳信息（供 staleness 模块做 fs.stat 检查） */
  getFileStamps(): Array<{ path: string; size: number; mtimeMs: number; status: string }> {
    return this.db.prepare(`
      SELECT path, size, mtime_ms AS mtimeMs, status
      FROM files
      WHERE status = 'active'
    `).all() as Array<{ path: string; size: number; mtimeMs: number; status: string }>;
  }

  /** 获取文件树概览：路径树 + H1 主题 + 外链数 + 最近变更标记 */
  getFileTree(sinceTimestamp?: string): {
    tree: FileTreeNode[];
    recentAdded: number;
    recentModified: number;
    recentDeleted: number;
    totalFiles: number;
  } {
    const since = sinceTimestamp || new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // 活跃文件
    const activeFiles = this.db.prepare(`
      SELECT f.id, f.path, f.indexed_at, f.status
      FROM files f WHERE f.status = 'active'
      ORDER BY f.path
    `).all() as Array<{ id: number; path: string; indexed_at: string; status: string }>;

    // 最近删除的文件
    const deletedFiles = this.db.prepare(`
      SELECT f.id, f.path, f.indexed_at
      FROM files f WHERE f.status = 'deleted' AND f.indexed_at > ?
      ORDER BY f.path
    `).all(since) as Array<{ id: number; path: string; indexed_at: string }>;

    // 每个文件的外链数
    const linkCounts = new Map<number, number>();
    const linkRows = this.db.prepare(`
      SELECT n.file_id, COUNT(DISTINCT e.id) as cnt
      FROM edges e
      JOIN doc_nodes n ON n.id = e.source_node_id
      GROUP BY n.file_id
    `).all() as Array<{ file_id: number; cnt: number }>;
    for (const r of linkRows) linkCounts.set(r.file_id, r.cnt);

    // 每个文件的 H1 主题
    const topics = new Map<number, string>();
    const topicRows = this.db.prepare(`
      SELECT file_id, heading_path FROM doc_nodes
      WHERE type = 'heading' AND heading_level = 1
    `).all() as Array<{ file_id: number; heading_path: string }>;
    for (const r of topicRows) topics.set(r.file_id, r.heading_path);

    let recentAdded = 0;
    let recentModified = 0;

    // 构建文件节点列表
    const fileNodes: Array<{
      path: string;
      name: string;
      topic?: string;
      linkCount: number;
      recentChange?: string;
      indexedAt: string;
      status: string;
    }> = [];

    for (const f of activeFiles) {
      const isRecent = f.indexed_at > since;
      let recentChange: string | undefined;
      if (isRecent) {
        const details = this.getFileChangeDetails(f.id);
        if (details) {
          try {
            const parsed = JSON.parse(details) as Array<{ type: string }>;
            const types = new Set(parsed.map(d => d.type));
            if (types.has('modified')) { recentChange = 'modified'; recentModified++; }
            else if (types.has('added')) { recentChange = 'added'; recentAdded++; }
            else recentChange = 'modified';
          } catch { recentChange = 'modified'; recentModified++; }
        } else {
          recentChange = 'added'; recentAdded++;
        }
      }

      fileNodes.push({
        path: f.path,
        name: f.path.replace(/\\/g, '/').split('/').pop() || f.path,
        topic: topics.get(f.id),
        linkCount: linkCounts.get(f.id) ?? 0,
        recentChange,
        indexedAt: f.indexed_at,
        status: f.status,
      });
    }

    // 构建路径前缀树
    const root: FileTreeNode = { name: '', children: [] };
    for (const fn of fileNodes) {
      const parts = fn.path.replace(/\\/g, '/').split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        let child = node.children?.find((c: FileTreeNode) => c.name === parts[i]);
        if (!child) {
          child = isLast
            ? {
                name: parts[i],
                path: fn.path,
                topic: fn.topic,
                linkCount: fn.linkCount,
                recentChange: fn.recentChange as FileTreeNode['recentChange'],
                children: [],
              }
            : { name: parts[i], children: [] };
          node.children!.push(child);
        }
        node = child;
      }
    }

    return {
      tree: root.children || [],
      recentAdded,
      recentModified,
      recentDeleted: deletedFiles.length,
      totalFiles: activeFiles.length,
    };
  }

  getStatus(): IndexStatus {
    const fileRow = this.db.prepare("SELECT COUNT(*) as count FROM files WHERE status = 'active'").get() as { count: number };
    const nodeRow = this.db.prepare('SELECT COUNT(*) as count FROM doc_nodes').get() as { count: number };
    const edgeRow = this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as { count: number };

    return {
      totalFiles: fileRow.count,
      totalNodes: nodeRow.count,
      totalEdges: edgeRow.count,
    };
  }

  // =========================================================================
  // 变更检测
  // =========================================================================

  getFileChangeDetails(fileId: number): string | null {
    const row = this.db.prepare('SELECT last_change_details FROM files WHERE id = ?').get(fileId) as { last_change_details: string | null } | undefined;
    return row?.last_change_details ?? null;
  }

  getChangedFilesSince(timestamp: string): ChangedFileRecord[] {
    return this.db.prepare(`
      SELECT id, path, indexed_at, last_change_details
      FROM files
      WHERE indexed_at > ?
      ORDER BY indexed_at DESC
    `).all(timestamp) as ChangedFileRecord[];
  }

  // =========================================================================
  // 变更批次
  // =========================================================================

  getChangeBatches(): ChangeBatchResult {
    const files = this.db.prepare(`
      SELECT id, path, last_change_details, indexed_at
      FROM files
      WHERE last_change_details IS NOT NULL
      ORDER BY indexed_at DESC
    `).all() as Array<{ id: number; path: string; last_change_details: string; indexed_at: string }>;

    if (files.length === 0) {
      return { batches: [], batchCount: 0, search_hint: '暂无变更记录。' };
    }

    // 解析变更记录，按文件合并（同文件多变更聚合为一条）
    const items: Array<{
      time: number;
      fileName: string;
      type: string;
      path: string;
      lineRanges: string;
      headingPath: string;
      keywords_line: string;
      related_line: string;
      changeCount: number;
    }> = [];

    for (const file of files) {
      const ts = Date.parse(file.indexed_at || '');
      const timeVal = Number.isNaN(ts) ? 0 : ts;

      let details: Array<{ type: string; headingPath: string; lineRanges: string; boldTerms?: string[]; italicTerms?: string[]; codeTerms?: string[] }> = [];
      try {
        details = JSON.parse(file.last_change_details);
      } catch {
        continue;
      }

      if (details.length === 0) continue;

      const fileName = file.path.replace(/\\/g, '/').split('/').pop() || file.path;

      // 确定主变更类型（优先 modified > added > deleted）
      const types = new Set(details.map(d => d.type));
      const mainType = types.has('modified') ? 'modified'
        : types.has('added') ? 'added'
        : 'deleted';

      // 聚合行号区间：解析为 [start,end] 对，合并相邻区间
      const ranges: Array<[number, number]> = [];
      for (const d of details) {
        if (!d.lineRanges) continue;
        const m = d.lineRanges.match(/^(\d+)-(\d+)$/);
        if (m) ranges.push([parseInt(m[1]), parseInt(m[2])]);
      }
      ranges.sort((a, b) => a[0] - b[0]);
      const merged: Array<[number, number]> = [];
      for (const r of ranges) {
        if (merged.length === 0) { merged.push([...r]); continue; }
        const last = merged[merged.length - 1];
        // 相邻或重叠：合并（间距 ≤ 2 行视为连续）
        if (r[0] <= last[1] + 2) {
          last[1] = Math.max(last[1], r[1]);
        } else {
          merged.push([...r]);
        }
      }
      const lrList = merged.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`);
      const lineRanges = lrList.length <= 5
        ? lrList.join(', ')
        : lrList.slice(0, 5).join(', ') + ` …等 ${lrList.length} 处`;

      // 聚合标题路径：取重复度最高的单个 heading
      const hpFreq = new Map<string, number>();
      for (const d of details) {
        if (d.headingPath) hpFreq.set(d.headingPath, (hpFreq.get(d.headingPath) || 0) + 1);
      }
      let bestHeading = '';
      let bestHpFreq = 0;
      for (const [hp, freq] of hpFreq) {
        if (freq > bestHpFreq) { bestHpFreq = freq; bestHeading = hp; }
      }
      // 所有 heading 都只出现一次时，用最长公共前缀
      const headingPath = bestHpFreq > 1
        ? bestHeading
        : compactHeadingPaths([...hpFreq.keys()]);

      // 聚合关键词：bold/italic/code 混排，频次降序，同频按权重（bold>italic>code）
      const termInfo = new Map<string, { freq: number; weight: number }>();
      for (const d of details) {
        d.boldTerms?.forEach(t => {
          const info = termInfo.get(t) || { freq: 0, weight: 0 };
          info.freq++; info.weight = Math.max(info.weight, 3);
          termInfo.set(t, info);
        });
        d.italicTerms?.forEach(t => {
          const info = termInfo.get(t) || { freq: 0, weight: 0 };
          info.freq++; info.weight = Math.max(info.weight, 2);
          termInfo.set(t, info);
        });
        d.codeTerms?.forEach(t => {
          const info = termInfo.get(t) || { freq: 0, weight: 0 };
          info.freq++; info.weight = Math.max(info.weight, 1);
          termInfo.set(t, info);
        });
      }
      const sorted = [...termInfo.entries()]
        .sort((a, b) => b[1].freq - a[1].freq || b[1].weight - a[1].weight);
      const topTerms = sorted.slice(0, 8);
      const keywords_line = topTerms.length > 0
        ? topTerms.map(([t, info]) => info.freq > 1 ? `${t}(×${info.freq})` : t).join(', ')
        : '';

      items.push({
        time: timeVal,
        fileName,
        type: mainType,
        path: file.path,
        lineRanges,
        headingPath,
        keywords_line,
        related_line: '',
        changeCount: details.length,
      });
    }

    // 按时间倒序排列
    items.sort((a, b) => b.time - a.time);

    // 按 ±15 分钟窗口分组（相邻变更间隔 < 30 分钟归入同一批次）
    const grouped: Array<typeof items> = [];
    let currentGroup: typeof items = [];
    let groupTime = 0;

    for (const item of items) {
      if (currentGroup.length === 0) {
        currentGroup.push(item);
        groupTime = item.time;
      } else if (Math.abs(item.time - groupTime) < 30 * 60 * 1000) {
        currentGroup.push(item);
      } else {
        grouped.push(currentGroup);
        currentGroup = [item];
        groupTime = item.time;
      }
    }
    if (currentGroup.length > 0) grouped.push(currentGroup);

    // 构建批次输出
    const batches: Batch[] = [];
    let index = 1;
    for (const group of grouped) {
      const centerTime = group[0]?.time || 0;
      const d = new Date(centerTime);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const timeWindow = `${hh}:${mm} ± 15min`;

      batches.push({
        index: index++,
        timeWindow,
        fileCount: group.length,
        files: group.map((g) => ({
          fileName: g.fileName,
          type: g.type as ChangeItem['type'],
          path: g.path,
          lineRanges: g.lineRanges,
          headingPath: g.headingPath,
          keywords_line: g.keywords_line,
          related_line: g.related_line,
          changeCount: g.changeCount,
        })),
      });
    }

    return {
      batches,
      batchCount: batches.length,
      search_hint: '试试搜索关键词，或使用 navigate 查看文件关系。',
    };
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  // =========================================================================
  // 内部方法
  // =========================================================================

  private executeSchema(): void {
    const schemaPath = this.resolveSchemaPath();
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  private resolveSchemaPath(): string {
    // 尝试多个路径定位 schema.sql
    const candidates = [
      path.join(process.cwd(), 'src', 'storage', 'schema.sql'),
    ];

    // 如果是 ESM 且有 __dirname 等价物
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(path.join(currentDir, 'schema.sql'));
    } catch {
      // ignore
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Cannot locate schema.sql');
  }
}

// =============================================================================
// compactHeadingPaths — 标题路径智能去重压缩
// 提取公共前缀，树形聚合，去除冗余，突出差异信息
// 例：["A > B > C", "A > B > D", "A > E"] => "A > B(C, D); E"
// =============================================================================
function compactHeadingPaths(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) return paths[0];

  const MAX_GROUPS = 5;
  const segments = paths.map(p => p.split(' > '));

  // 找最长公共前缀
  const minLen = Math.min(...segments.map(s => s.length));
  let lcpLen = 0;
  for (let i = 0; i < minLen; i++) {
    const seg = segments[0][i];
    if (segments.every(s => s[i] === seg)) {
      lcpLen++;
    } else {
      break;
    }
  }

  const prefix = segments[0].slice(0, lcpLen).join(' > ');

  // 去掉公共前缀，建树
  type HpNode = { name: string; children: Map<string, HpNode> };
  const root: HpNode = { name: '', children: new Map() };

  for (const segs of segments) {
    const rest = segs.slice(lcpLen);
    if (rest.length === 0) continue; // 完全匹配前缀的跳过
    let node = root;
    for (const seg of rest) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, children: new Map() });
      }
      node = node.children.get(seg)!;
    }
  }

  // 只展示一级子节点 + 子树节点数，不展开深层名称（agent 用 md_search 定位细节）
  const totalSubCount = (node: HpNode): number => {
    let count = node.children.size;
    for (const child of node.children.values()) count += totalSubCount(child);
    return count;
  };

  const truncate = (s: string, max: number) => s.length <= max ? s : s.slice(0, max - 1) + '…';
  const groups: string[] = [];
  for (const [name, child] of root.children) {
    const shortName = truncate(name, 24);
    const subCount = totalSubCount(child);
    groups.push(subCount > 0 ? `${shortName}(+${subCount})` : shortName);
  }

  const totalGroups = groups.length;
  let result = prefix;

  if (groups.length > 0) {
    const shown = groups.slice(0, MAX_GROUPS);
    result += (result ? ' > ' : '') + shown.join(', ');
  }

  if (totalGroups > MAX_GROUPS) {
    result += ` …等 ${totalGroups} 组`;
  }

  return result || paths[0];
}
