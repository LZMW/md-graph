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
                             searchable, parent_id, ordinal, heading_level, heading_path, line_ranges)
      VALUES (@file_id, @type, @line_start, @line_end, @col_start, @col_end,
              @searchable, @parent_id, @ordinal, @heading_level, @heading_path, @line_ranges)
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
    });
    return { id: Number(result.lastInsertRowid) };
  }

  insertNodes(nodes: NodeInsert[]): number[] {
    const stmt = this.db.prepare(`
      INSERT INTO doc_nodes (file_id, type, line_start, line_end, col_start, col_end,
                             searchable, parent_id, ordinal, heading_level, heading_path, line_ranges)
      VALUES (@file_id, @type, @line_start, @line_end, @col_start, @col_end,
              @searchable, @parent_id, @ordinal, @heading_level, @heading_path, @line_ranges)
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

    // 解析每个文件的变更记录并收集时间戳
    const items: Array<{
      time: number;
      fileName: string;
      type: string;
      path: string;
      lineRanges: string;
      headingPath: string;
      keywords_line: string;
      related_line: string;
    }> = [];

    for (const file of files) {
      const ts = Date.parse(file.indexed_at || '');
      const timeVal = Number.isNaN(ts) ? 0 : ts;

      let details: Array<{ type: string; headingPath: string; lineRanges: string; boldTerms?: string[]; italicTerms?: string[]; codeTerms?: string[] }> = [];
      try {
        details = JSON.parse(file.last_change_details);
      } catch {
        // ignore parse errors
      }

      const fileName = file.path.replace(/\\/g, '/').split('/').pop() || file.path;
      for (const d of details) {
        items.push({
          time: timeVal,
          fileName,
          type: d.type || 'modified',
          path: file.path,
          lineRanges: d.lineRanges || '',
          headingPath: d.headingPath || '',
          keywords_line: d.boldTerms?.length ? `关键词: ${d.boldTerms.join(', ')}` : '',
          related_line: '',
        });
      }
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
