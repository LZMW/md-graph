// =============================================================================
// MdGraph — Facade 外观模式
// 连接全部子系统（Indexer, Searcher, Traverser, Watcher）
// 暴露单一入口：status / navigate / search
// =============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { FileStore } from './storage/filestore.js';
import { SqliteDbAdapter } from './storage/database.js';
import { ParserRegistry, registerDefaultParsers } from './analysis/parser/index.js';
import { TemplateEngine } from './api/template.js';
import { Indexer } from './analysis/indexer.js';
import { Searcher } from './analysis/searcher.js';
import { Traverser } from './analysis/traverser.js';
import { Watcher } from './analysis/watcher.js';
import { checkStaleness, mergeStaleness } from './storage/staleness.js';
import type {
  SearchResult,
  SearchOptions,
  NavResult,
  Direction,
  IndexResult,
  StalenessInfo,
} from './types.js';

// ---------------------------------------------------------------------------
// MdGraph 状态
// ---------------------------------------------------------------------------
export interface MdGraphStatus {
  totalFiles: number;
  totalNodes: number;
  totalEdges: number;
  lastIndexedAt: string;
  stale: boolean;
  staleFileCount: number;
}

// ---------------------------------------------------------------------------
// MdGraphOptions
// ---------------------------------------------------------------------------
export interface MdGraphOptions {
  dbPath?: string;       // 数据库路径，默认 rootPath/.md-graph/index.db
  storageDir?: string;   // 存储目录，默认 rootPath/.md-graph
  autoWatch?: boolean;   // 是否自动启动文件监控，默认 false
  debug?: boolean;       // 是否输出调试日志
}

// =============================================================================
// MdGraph — Facade 主类
// =============================================================================
export class MdGraph {
  private readonly rootPath: string;
  private readonly dbPath: string;
  private readonly storageDir: string;
  private readonly autoWatch: boolean;
  private readonly debug: boolean;

  private db!: SqliteDbAdapter;
  private fileStore!: FileStore;
  private indexer!: Indexer;
  private searcher!: Searcher;
  private traverser!: Traverser;
  private watcher!: Watcher;
  private template!: TemplateEngine;
  private initialized = false;

  constructor(rootPath: string, options?: MdGraphOptions) {
    this.rootPath = path.resolve(rootPath);
    this.storageDir = options?.storageDir ?? path.join(this.rootPath, '.md-graph');
    this.dbPath = options?.dbPath ?? path.join(this.storageDir, 'index.db');
    this.autoWatch = options?.autoWatch ?? false;
    this.debug = options?.debug ?? false;
    this.log('MdGraph 实例创建', { rootPath: this.rootPath, dbPath: this.dbPath });
  }

  // =========================================================================
  // init — 初始化子系统（惰性初始化）
  // =========================================================================
  async init(): Promise<void> {
    if (this.initialized) return;

    this.log('初始化 MdGraph 子系统');

    // 初始化存储
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.db = new SqliteDbAdapter(this.dbPath);
    this.fileStore = new FileStore(this.rootPath);

    // 注册默认解析器
    registerDefaultParsers();

    // 初始化分析模块
    this.indexer = new Indexer(this.fileStore, this.db, ParserRegistry);
    this.searcher = new Searcher(this.db, this.rootPath);
    this.traverser = new Traverser(this.db, this.rootPath);

    // 初始化模板引擎
    this.template = new TemplateEngine();

    // 初始化 watcher
    this.watcher = new Watcher(this.rootPath, this.indexer);
    if (this.autoWatch) {
      this.watcher.start();
      this.log('文件监控已启动');
    }

    this.initialized = true;
    this.log('MdGraph 子系统初始化完成');
  }

  // =========================================================================
  // status — 返回索引状态
  // =========================================================================
  async status(): Promise<MdGraphStatus> {
    await this.ensureInitialized();

    // 运行增量索引确保最新
    try {
      await this.indexer.incrementalIndex(this.rootPath);
    } catch {
      // 索引失败不影响状态查询
    }

    const dbStatus = this.db.getStatus();
    const dbStaleInfo = this.db.getStaleInfo();
    const staleInfo = mergeStaleness(
      checkStaleness(this.rootPath, this.db.getFileStamps()),
      dbStaleInfo.lastIndexedAt,
    );

    return {
      totalFiles: dbStatus.totalFiles,
      totalNodes: dbStatus.totalNodes,
      totalEdges: dbStatus.totalEdges,
      lastIndexedAt: staleInfo.lastIndexedAt,
      stale: staleInfo.stale,
      staleFileCount: staleInfo.staleFileCount,
    };
  }

  // =========================================================================
  // search — 全文搜索
  // =========================================================================
  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    await this.ensureInitialized();
    return this.searcher.search(query, options);
  }

  // =========================================================================
  // navigate — BFS 导航
  // =========================================================================
  async navigate(
    nodeId: number,
    direction: Direction,
    depth: number = 1,
  ): Promise<NavResult> {
    await this.ensureInitialized();
    return this.traverser.navigate(nodeId, direction, depth);
  }

  // =========================================================================
  // fullIndex — 全量索引
  // =========================================================================
  async fullIndex(rootPath?: string): Promise<IndexResult> {
    await this.ensureInitialized();
    return this.indexer.fullIndex(rootPath ?? this.rootPath);
  }

  // =========================================================================
  // close — 关闭所有资源
  // =========================================================================
  async close(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.db) {
      this.db.close();
    }
    this.initialized = false;
    this.log('MdGraph 已关闭');
  }

  // =========================================================================
  // renderStatus — 渲染状态文本（包含变更批次）
  // =========================================================================
  async renderStatus(): Promise<string> {
    await this.ensureInitialized();
    const status = await this.status();

    // 尝试从数据库中获取变更批次
    let changeBatch: Record<string, unknown> = { batches: [], batchCount: 0, search_hint: '' };
    try {
      changeBatch = this.db.getChangeBatches() as unknown as Record<string, unknown>;
    } catch {
      // 使用默认空批次
    }

    return this.template.renderStatus({
      ...changeBatch,
      search_hint: (changeBatch.search_hint as string) || '试试搜索关键词，或使用 navigate 查看文件关系。',
      stale: status.stale,
      staleFileCount: status.staleFileCount,
      lastIndexedAt: status.lastIndexedAt,
    });
  }

  // =========================================================================
  // renderSearch — 渲染搜索结果文本
  // =========================================================================
  async renderSearch(query: string, options?: SearchOptions): Promise<string> {
    await this.ensureInitialized();
    const searchResult = await this.search(query, options);

    const results = searchResult.results.map((r) => ({
      fileName: r.fileName,
      filePath: r.filePath,
      headingPath: r.headingPath,
      snippet: r.snippet,
      lineRanges: r.lineRanges,
      score: r.score,
      related_line: r.relatedDocCount > 0 ? `关联: ${r.relatedDocCount} 个文档链接到此` : '',
    }));

    const hasRelated = searchResult.results.some(r => r.relatedDocCount > 0);
    const navigateHint = hasRelated ? ' 关联数 > 0 的结果可使用 md_navigate 查看文档关系图。' : '';

    return this.template.renderSearch({
      query,
      totalResults: searchResult.totalResults,
      results,
      navigate_hint: navigateHint,
      stale: searchResult.stale,
      staleFileCount: searchResult.staleFileCount,
      lastIndexedAt: searchResult.lastIndexedAt,
    });
  }

  // =========================================================================
  // renderNavigate — 渲染导航结果文本
  // =========================================================================
  async renderNavigate(
    nodeIdOrPath: number | string,
    direction: string,
    depth: number = 1,
  ): Promise<string> {
    await this.ensureInitialized();
    let nodeId: number;

    if (typeof nodeIdOrPath === 'number') {
      nodeId = nodeIdOrPath;
    } else {
      // 通过文件路径查找 nodeId
      const fileRecord = this.db.getFileByPath(nodeIdOrPath);
      if (!fileRecord) {
        return `## 文件关系: ${nodeIdOrPath}\n\n未找到文件。请检查路径是否正确。`;
      }
      const nodes = this.db.getNodesByFile(fileRecord.id);
      if (nodes.length === 0) {
        return `## 文件关系: ${nodeIdOrPath}\n\n文件中未找到可导航的节点。`;
      }
      nodeId = nodes[0].id;
    }

    const navResult = await this.navigate(
      nodeId,
      direction as 'inbound' | 'outbound' | 'impact',
      depth,
    );

    return this.template.renderNavigate({
      fileName: navResult.sourceFileName || navResult.sourcePath,
      sourcePath: navResult.sourcePath,
      topic: navResult.topic,
      direction: navResult.direction,
      depth: navResult.depth,
      totalLinks: navResult.totalLinks,
      links: navResult.links.map((l) => ({
        linkText: l.linkText,
        targetPath: l.targetPath,
        targetFileName: l.targetFileName,
        sourceLineRanges: l.sourceLineRanges,
        targetTopic: l.targetTopic,
        status: l.status,
      })),
      stale: navResult.stale,
      staleFileCount: navResult.staleFileCount,
      lastIndexedAt: navResult.lastIndexedAt,
    });
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private log(message: string, data?: unknown): void {
    if (this.debug) {
      const prefix = `[MdGraph]`;
      if (data) {
        console.error(prefix, message, data);
      } else {
        console.error(prefix, message);
      }
    }
  }
}
