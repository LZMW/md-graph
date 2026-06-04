// =============================================================================
// md-graph Shared Type Definitions
// Gate 3 裁决: gen-1 集中定义在 src/types.ts, gen-2+ 超过 30 文件后重新评估
// =============================================================================

// ---------------------------------------------------------------------------
// 节点类型
// ---------------------------------------------------------------------------
export type NodeType =
    | 'document'
    | 'heading'
    | 'paragraph'
    | 'list_item'
    | 'code_block'
    | 'blockquote'
    | 'table_row';

// ---------------------------------------------------------------------------
// 文档节点
// ---------------------------------------------------------------------------
export interface DocNode {
    id?: number;
    type: NodeType;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    colStart: number;
    colEnd: number;
    searchable: boolean;
    content?: string;
    snippet?: string;
    parentId?: number;
    ordinal: number;
    headingLevel?: number;
    headingPath?: string;
    links?: ExtractedLink[];
    inlineTokens?: string;
}

// ---------------------------------------------------------------------------
// 提取的链接
// ---------------------------------------------------------------------------
export interface ExtractedLink {
    rawHref: string;
    linkText: string;
    line: number;
    col: number;
    type: 'internal' | 'external' | 'anchor';
}

// ---------------------------------------------------------------------------
// 解析后的文档
// ---------------------------------------------------------------------------
export interface HeadingInfo {
    level: number;
    text: string;
    lineStart: number;
}

export interface CodeBlockInfo {
    language?: string;
    content: string;
    lineStart: number;
    lineEnd: number;
}

export interface ParsedDocument {
    nodes: DocNode[];
    edges: ExtractedLink[];
    metadata: {
        title?: string;
        headings: HeadingInfo[];
        codeBlocks: CodeBlockInfo[];
        error?: string;
    };
    contentHash: string;
}

// ---------------------------------------------------------------------------
// 错误处理
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 错误码常量（DI 定义，裁决 #9）
// ---------------------------------------------------------------------------
export const ErrorCodes = {
  INVALID_QUERY: 'INVALID_QUERY',
  INVALID_PATH: 'INVALID_PATH',
  INDEX_NOT_INITIALIZED: 'INDEX_NOT_INITIALIZED',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  WATCHER_NOT_READY: 'WATCHER_NOT_READY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export class MdGraphError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause: string = '',
    public fix: string = '',
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'MdGraphError';
  }

  toText(): string {
    return `${this.message}\n原因: ${this.cause}\n修复: ${this.fix}`;
  }
}

// ---------------------------------------------------------------------------
// 搜索结果
// ---------------------------------------------------------------------------
export interface SearchOptions {
    maxResults?: number;   // default: 20, max: 50
    fileGlob?: string;
    type?: 'heading' | 'paragraph' | 'code_block';
    file?: string;         // 按文件路径精确过滤
}

export interface SearchResultItem {
    id: number;
    type: NodeType;
    fileId: number;
    filePath: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    lineRanges: string;
    score: number;
    snippet: string;
    headingPath: string;
    relatedDocCount: number;
    stale: boolean;
}

export interface SearchResult {
    totalResults: number;
    results: SearchResultItem[];
    stale: boolean;
    staleFileCount: number;
    lastIndexedAt: string;
}

// ---------------------------------------------------------------------------
// 导航结果
// ---------------------------------------------------------------------------
export type Direction = 'inbound' | 'outbound' | 'impact';

export interface NavLink {
    sourceLineRanges: string;
    linkText: string;
    targetNodeId: number | null;
    targetFileId: number | null;
    targetPath: string;
    targetFileName: string;
    targetTopic: string;
    status: 'resolved' | 'broken' | 'external';
}

export interface NavResult {
    sourceNodeId: number;
    sourceFileId: number;
    sourcePath: string;
    sourceFileName: string;
    topic: string;
    direction: Direction;
    depth: number;
    totalLinks: number;
    links: NavLink[];
    truncated?: boolean;
    stale: boolean;
    staleFileCount: number;
    lastIndexedAt: string;
    tookMs: number;
}

// ---------------------------------------------------------------------------
// 过时信息（横切关注点）
// ---------------------------------------------------------------------------
export interface StalenessInfo {
    stale: boolean;
    staleFileCount: number;
    lastIndexedAt: string;
}

// ---------------------------------------------------------------------------
// 错误响应
// ---------------------------------------------------------------------------
export interface ErrorResponse {
    isError: true;
    code: string;
    message: string;
    cause: string;
    fix: string;
    recoverable: boolean;
}

// ---------------------------------------------------------------------------
// 索引结果
// ---------------------------------------------------------------------------
export interface IndexResult {
    indexedCount: number;
    skippedCount: number;
    failedCount: number;
    failedFiles: string[];
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    durationMs: number;
    lastIndexedAt: string;
}

export interface ChangeDetail {
    type: 'added' | 'modified' | 'deleted';
    nodeId: number;
    headingPath: string;
    lineRanges: string;
    boldTerms?: string[];
    italicTerms?: string[];
    codeTerms?: string[];
}

// ---------------------------------------------------------------------------
// 变更批次类型（供 template.ts / getChangeBatches 使用）
// ---------------------------------------------------------------------------
export interface ChangeItem {
  fileName: string;
  type: 'added' | 'modified' | 'deleted';
  path: string;
  lineRanges: string;
  headingPath: string;
  keywords_line: string;
  related_line: string;
  changeCount?: number;
}

export interface Batch {
  index: number;
  timeWindow: string;
  fileCount: number;
  files: ChangeItem[];
}

export interface ChangeBatchResult {
  batches: Batch[];
  batchCount: number;
  search_hint: string;
}

// ---------------------------------------------------------------------------
// 文件树节点（md_files 工具）
// ---------------------------------------------------------------------------
export interface FileTreeNode {
  name: string;
  path?: string;
  topic?: string;
  linkCount?: number;
  recentChange?: 'added' | 'modified' | 'deleted';
  children?: FileTreeNode[];
}

// ---------------------------------------------------------------------------
// 文件信息
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
// 数据库记录类型（供 SqliteDbAdapter 内部使用）
// ---------------------------------------------------------------------------
export interface FileRecord {
    id: number;
    path: string;
    content_hash: string;
    size: number;
    mtime_ms: number;
    indexed_at: string;
    node_count: number;
    last_change_details: string | null;
    status: 'active' | 'deleted';
}

export interface NodeRecord {
    id: number;
    file_id: number;
    type: NodeType;
    line_start: number;
    line_end: number;
    col_start: number;
    col_end: number;
    searchable: number;
    parent_id: number | null;
    ordinal: number;
    heading_level: number | null;
    heading_path: string | null;
    line_ranges: string | null;
    inline_tokens: string | null;
    snippet: string | null;
}

export interface EdgeRecord {
    id: number;
    source_node_id: number;
    target_node_id: number | null;
    raw_href: string;
    link_text: string | null;
    line: number | null;
    col: number | null;
    status: 'resolved' | 'broken' | 'external';
}

// 插入类型（id 和默认字段由数据库自动生成）
export interface FileInsert {
    path: string;
    content_hash: string;
    size: number;
    mtime_ms: number;
    status?: 'active' | 'deleted';
}

export interface NodeInsert {
    file_id: number;
    type: NodeType;
    line_start: number;
    line_end: number;
    col_start: number;
    col_end: number;
    searchable?: number;
    parent_id?: number | null;
    ordinal: number;
    heading_level?: number | null;
    heading_path?: string | null;
    line_ranges?: string | null;
}

export interface EdgeInsert {
    source_node_id: number;
    target_node_id?: number | null;
    raw_href: string;
    link_text?: string | null;
    line?: number | null;
    col?: number | null;
    status?: 'resolved' | 'broken' | 'external';
}
