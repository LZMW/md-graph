// =============================================================================
// Indexer — 索引协调模块
// 提供全量/增量/重建三种索引模式 + 变更差异计算
// 依赖: FileStore, SqliteDbAdapter, ParserRegistry
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '../storage/filestore.js';
import { SqliteDbAdapter } from '../storage/database.js';
import { ParserRegistry } from './parser/index.js';
import type { DocNode, FileInfo, IndexResult, ChangeDetail } from '../types.js';

// ---------------------------------------------------------------------------
// 简化 ChangeNode 类型 — 用于 computeChanges 的入参
// ---------------------------------------------------------------------------
interface ChangeNode {
  headingPath?: string | null;
  lineRanges?: string | null;
  lineStart?: number;
  lineEnd?: number;
  boldTerms?: string[];
  italicTerms?: string[];
  codeTerms?: string[];
}

// =============================================================================
// Indexer
// =============================================================================
export class Indexer {
  constructor(
    private readonly fileStore: FileStore,
    private readonly db: SqliteDbAdapter,
    private readonly parserRegistry: typeof ParserRegistry,
  ) {}

  // =========================================================================
  // fullIndex — 全量索引
  // 扫描所有 .md 文件，解析并写入数据库
  // =========================================================================
  async fullIndex(rootPath?: string): Promise<IndexResult> {
    const startTime = Date.now();
    const scanRoot = rootPath || this.fileStore['rootPath'];
    const mdFiles = await this.discoverMdFiles(scanRoot);

    let indexedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedFiles: string[] = [];

    for (const relPath of mdFiles) {
      try {
        const changed = await this.indexFileIfChanged(relPath);
        if (changed) {
          indexedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        failedCount++;
        failedFiles.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 标记已删除的文件
    const deletedCount = await this.markDeletedFiles(mdFiles);

    // 统计数据
    const totalFiles = mdFiles.length;
    const totalNodes = this.db.getNodeCount();
    const totalEdges = this.db.getEdgeCount();

    // 更新 indexed_at（全部完成的最后时间）
    const now = new Date().toISOString();
    for (const f of this.db.getAllFiles()) {
      if (f.status === 'active') {
        this.db.updateFile(f.id, { indexed_at: now });
      }
    }

    return {
      indexedCount,
      skippedCount,
      failedCount,
      failedFiles,
      totalFiles,
      totalNodes,
      totalEdges,
      durationMs: Date.now() - startTime,
      lastIndexedAt: now,
    };
  }

  // =========================================================================
  // incrementalIndex — 增量索引
  // 只处理有变更的文件（基于 mtime 和 contentHash）
  // =========================================================================
  async incrementalIndex(rootPath?: string): Promise<IndexResult> {
    const startTime = Date.now();
    const scanRoot = rootPath || this.fileStore['rootPath'];
    const mdFiles = await this.discoverMdFiles(scanRoot);

    let indexedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedFiles: string[] = [];

    for (const relPath of mdFiles) {
      try {
        const dbRecord = this.db.getFileByPath(relPath);
        const absPath = path.resolve(scanRoot, relPath);

        let needIndex = true;
        if (dbRecord && dbRecord.status === 'active') {
          // 检查文件是否真的变更了
          try {
            const stats = fs.statSync(absPath);
            const content = await this.fileStore.read(relPath);
            const currentHash = this.fileStore.hash(content);
            needIndex = (dbRecord.content_hash !== currentHash);
          } catch {
            // stat/read 失败则重新索引
          }
        }

        if (needIndex) {
          await this.indexSingleFile(relPath, scanRoot);
          indexedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        failedCount++;
        failedFiles.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 标记已删除的文件
    await this.markDeletedFiles(mdFiles);

    const totalNodes = this.db.getNodeCount();
    const totalEdges = this.db.getEdgeCount();
    const now = new Date().toISOString();

    return {
      indexedCount,
      skippedCount,
      failedCount,
      failedFiles,
      totalFiles: mdFiles.length,
      totalNodes,
      totalEdges,
      durationMs: Date.now() - startTime,
      lastIndexedAt: now,
    };
  }

  // =========================================================================
  // rebuildIndex — 重建索引
  // 清空所有数据后重新执行全量索引
  // =========================================================================
  async rebuildIndex(rootPath?: string): Promise<IndexResult> {
    // 清空所有数据
    const allFiles = this.db.getAllFiles();
    for (const f of allFiles) {
      this.db.deleteNodesByFile(f.id);
      this.db.deleteFile(f.id);
    }

    // 重新全量索引
    return this.fullIndex(rootPath);
  }

  // =========================================================================
  // computeChanges — 变更差异计算
  // 对比旧节点（DB 记录）和新节点（解析结果），生成 ChangeDetail[]
  // =========================================================================
  computeChanges(
    oldNodes: { heading_path?: string | null; line_ranges?: string | null }[],
    newNodes: { headingPath?: string; lineStart?: number; lineEnd?: number }[],
  ): ChangeDetail[] {
    const changes: ChangeDetail[] = [];

    const oldMap = new Map<string, { heading_path?: string | null; line_ranges?: string | null }>();
    for (const n of oldNodes) {
      const key = n.heading_path || '';
      oldMap.set(key, n);
    }

    const newMap = new Map<string, { headingPath?: string; lineStart?: number; lineEnd?: number }>();
    for (const n of newNodes) {
      const key = n.headingPath || '';
      newMap.set(key, n);
    }

    // 检测新增和修改
    for (const [key, newNode] of newMap) {
      const oldNode = oldMap.get(key);
      if (!oldNode) {
        // 新增节点
        changes.push({
          type: 'added',
          nodeId: 0, // 暂未分配 DB id
          headingPath: key,
          lineRanges: newNode.lineStart ? `${newNode.lineStart}-${newNode.lineEnd ?? newNode.lineStart}` : '',
        });
      } else {
        // 检查是否修改（line_ranges 变化即为修改）
        const oldRange = oldNode.line_ranges || '';
        const newRange = newNode.lineStart ? `${newNode.lineStart}-${newNode.lineEnd ?? newNode.lineStart}` : '';
        if (oldRange !== newRange) {
          changes.push({
            type: 'modified',
            nodeId: 0,
            headingPath: key,
            lineRanges: newRange,
          });
        }
      }
    }

    // 检测删除
    for (const [key, oldNode] of oldMap) {
      if (!newMap.has(key)) {
        changes.push({
          type: 'deleted',
          nodeId: 0,
          headingPath: key,
          lineRanges: oldNode.line_ranges || '',
        });
      }
    }

    return changes;
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** 发现所有 .md 文件 */
  private async discoverMdFiles(rootPath: string): Promise<string[]> {
    const store = new FileStore(rootPath);
    return store.glob('**/*.md');
  }

  /** 检查文件是否变更，只在变更时重新索引 */
  private async indexFileIfChanged(relPath: string): Promise<boolean> {
    const dbRecord = this.db.getFileByPath(relPath);
    if (!dbRecord || dbRecord.status !== 'active') {
      // 新文件
      await this.indexSingleFile(relPath);
      return true;
    }

    // 检查 contentHash
    try {
      const content = await this.fileStore.read(relPath);
      const currentHash = this.fileStore.hash(content);
      if (dbRecord.content_hash === currentHash) {
        return false; // 未变更
      }
    } catch {
      // 读文件失败则重新索引
    }

    await this.indexSingleFile(relPath);
    return true;
  }

  /** 索引单个文件：解析并写入数据库 */
  private async indexSingleFile(relPath: string, rootPath?: string): Promise<void> {
    const content = await this.fileStore.read(relPath);
    const stats = this.fileStore.stat(relPath);

    // 获取解析器
    const ext = path.extname(relPath).toLowerCase().replace('.', '') as 'md' | 'mdx';
    const parser = this.parserRegistry.get(ext);
    if (!parser) {
      throw new Error(`No parser registered for extension: ${ext}`);
    }

    // 解析文档
    const parsed = parser.parse(content, relPath);

    // 写数据库 — 使用事务
    const fileData = {
      path: relPath,
      content_hash: parsed.contentHash,
      size: stats.size,
      mtime_ms: stats.mtimeMs,
      status: 'active' as const,
    };

    const existingFile = this.db.getFileByPath(relPath);
    let fileId: number;

    if (existingFile) {
      // 计算变更差异（先获取旧节点再删除）
      const oldNodes = this.db.getNodesByFile(existingFile.id);
      const changes = this.computeChanges(
        oldNodes.map(n => ({ heading_path: n.heading_path, line_ranges: n.line_ranges })),
        parsed.nodes.map(n => ({ headingPath: n.headingPath, lineStart: n.lineStart, lineEnd: n.lineEnd })),
      );
      const changeDetailsJson = changes.length > 0 ? JSON.stringify(changes) : null;

      // 删除旧节点和边，然后更新文件记录
      this.db.deleteNodesByFile(existingFile.id);
      this.db.updateFile(existingFile.id, {
        content_hash: parsed.contentHash,
        size: stats.size,
        mtime_ms: stats.mtimeMs,
        node_count: parsed.nodes.length,
        indexed_at: new Date().toISOString(),
        last_change_details: changeDetailsJson,
      });
      fileId = existingFile.id;
    } else {
      const result = this.db.insertFile(fileData);
      fileId = result.id;
      // 新文件所有节点标记为 added
      const newFileChanges: ChangeDetail[] = parsed.nodes.map(n => ({
        type: 'added' as const,
        nodeId: n.id ?? 0,
        headingPath: n.headingPath || '',
        lineRanges: n.lineStart ? `${n.lineStart}-${n.lineEnd ?? n.lineStart}` : '',
      }));
      this.db.updateFile(fileId, {
        node_count: parsed.nodes.length,
        indexed_at: new Date().toISOString(),
        last_change_details: JSON.stringify(newFileChanges),
      });
    }

    // 逐节点插入（顺序插入以正确处理 parent_id FK 约束）
    const parsedIdToDbId = new Map<number, number>();
    const insertedNodeIds: number[] = [];

    for (const node of parsed.nodes) {
      const nodeId = node.id!;
      const dbParentId = node.parentId != null && node.parentId !== undefined
        ? (parsedIdToDbId.get(node.parentId) ?? null)
        : null;

      const lineRanges = node.lineStart ? `${node.lineStart}-${node.lineEnd ?? node.lineStart}` : null;

      const result = this.db.insertNode({
        file_id: fileId,
        type: node.type,
        line_start: node.lineStart,
        line_end: node.lineEnd,
        col_start: node.colStart,
        col_end: node.colEnd,
        searchable: node.searchable ? 1 : 0,
        parent_id: dbParentId,
        ordinal: node.ordinal,
        heading_level: node.headingLevel ?? null,
        heading_path: node.headingPath ?? null,
        line_ranges: lineRanges,
      });
      parsedIdToDbId.set(nodeId, result.id);
      insertedNodeIds.push(result.id);
    }

    // 插入节点内容和边
    for (let i = 0; i < parsed.nodes.length; i++) {
      const node = parsed.nodes[i];
      const dbNodeId = insertedNodeIds[i];

      // 搜索内容写入 doc_node_content
      if (node.content) {
        this.db.insertContent(dbNodeId, node.content);
      }

      // 边
      if (node.links && node.links.length > 0) {
        for (const link of node.links) {
          this.db.insertEdge({
            source_node_id: dbNodeId,
            raw_href: link.rawHref,
            link_text: link.linkText,
            line: link.line,
            col: link.col,
            status: link.type === 'external' ? 'external' : 'broken',
          });
        }
      }
    }

    // 处理文档级的边（从 parsed.edges）
    if (parsed.edges && parsed.edges.length > 0 && insertedNodeIds.length > 0) {
      for (const edge of parsed.edges) {
        const sourceNode = parsed.nodes.find(n =>
          n.links?.some(l => l.rawHref === edge.rawHref)
        );
        if (sourceNode && sourceNode.id) {
          const dbSourceId = parsedIdToDbId.get(sourceNode.id);
          if (dbSourceId) {
            this.db.insertEdge({
              source_node_id: dbSourceId,
              raw_href: edge.rawHref,
              link_text: edge.linkText,
              line: edge.line,
              col: edge.col,
              status: edge.type === 'external' ? 'external'
                : edge.type === 'anchor' ? 'resolved' : 'broken',
            });
          }
        }
      }
    }
  }

  /** 标记已不存在的文件为 deleted */
  private async markDeletedFiles(existingPaths: string[]): Promise<number> {
    const fileSet = new Set(existingPaths);
    let deletedCount = 0;

    for (const dbFile of this.db.getFilesByStatus('active')) {
      if (!fileSet.has(dbFile.path)) {
        // 文件在文件系统中不存在了，标记为 deleted
        this.db.updateFile(dbFile.id, {
          status: 'deleted' as const,
        });
        deletedCount++;
      }
    }

    return deletedCount;
  }
}
