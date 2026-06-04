// =============================================================================
// SERVER_INSTRUCTIONS — MCP 服务器使用说明
// 描述 md-graph MCP 服务器的 3 个工具及其用法
// =============================================================================

/**
 * 生成 MCP 服务器使用说明
 * 包含 3 个工具的详细用法描述，供 AI 客户端理解 md-graph 的能力
 * 共 6 段：引言 + 工具对照表 + 详细描述 + _next 解读 + stale 解读 + 错误恢复
 */
export function createServerInstructions(): string {
  return `# md-graph MCP Server — Markdown 知识图谱引擎

## 一、引言

md-graph 是一个 Markdown 知识图谱引擎。它索引 Markdown 文件中的标题、段落、代码块和链接关系，构建可搜索、可导航的知识图谱。AI 客户端可以通过以下 3 个工具与知识库交互。

## 二、工具对照表

| 工具 | 功能 | 必填参数 | 可选参数 |
|------|------|----------|----------|
| md_status | 变更感知入口 — 查看最近被修改、新增、删除的 MD 文件 | 无 | batches, since, limit |
| md_search | 全文搜索匹配内容 | query | maxResults, type, file |
| md_navigate | 浏览节点关系（入链/出链） | direction，以及 nodeId 或 path（二选一） | depth, maxResults |
| md_files | 已索引文件全貌（目录树 + 最近变更标记） | 无 | 无 |

## 三、详细描述

### 1. md_status — 变更感知入口

**何时使用**: 每次会话开始时首先调用，了解最近有哪些文档发生了变更。

**返回内容**:
- 按 ±15 分钟时间窗口分组的变更批次
- 每个文件的变更类型（新增/修改/删除）、行号区间、关键词（加粗/斜体/行内代码）
- 变更所属的标题路径

**参数说明**:
- batches (number, 可选): 时间批次数量（默认 3），每批次按 ±15 分钟窗口分组
- since (string, 可选): ISO 8601 时间戳，仅显示该时间之后的变更
- limit (number, 可选): 每批次最大文件数（默认 50）

**使用示例**:
\`\`\`
工具调用: md_status({ batches: 2 })
\`\`\`

### 2. md_search — 全文搜索

**何时使用**: 需要跨所有已索引 MD 文件搜索某个概念或关键词时。

**特点**: 比 Grep 更精确——匹配范围限定在语义 MD 块（段落、标题、列表项）而非原始文本行。结果按 FTS5 BM25 相关度排序。

**参数说明**:
- query (string, 必填): 搜索关键词
- maxResults (number, 可选): 最大结果数（默认 20，最大 50）
- type (string, 可选): 按节点类型过滤（"heading"、"paragraph"、"code_block"）
- file (string, 可选): 按文件路径精确过滤

**返回说明**:
- totalResults: 匹配总数
- results: 搜索结果列表，每条包含 filePath、headingPath、snippet、lineRanges、score
- stale / staleFileCount / lastIndexedAt: 索引过期信息

**使用示例**:
\`\`\`
工具调用: md_search({ query: "安装", maxResults: 5 })
\`\`\`

### 3. md_navigate — 文档链接关系

**何时使用**: 需要理解文档之间的引用关系时——查看一个文档引用了哪些文档（出链），或被哪些文档引用（入链）。

**特点**: 返回目标文档的 H1 标题作为文件主题，帮助快速判断相关性。支持 depth 参数扩大遍历层数。

**参数说明**:
- nodeId (number, 与 path 二选一): 起始节点 ID
- path (string, 与 nodeId 二选一): 起始文件路径
- direction (string, 必填): "inbound" 或 "outbound"
- depth (number, 可选): 遍历深度（默认 1，最大 30）
- maxResults (number, 可选): 最大返回链接数（默认 20，最大 100）

**返回说明**:
- sourcePath: 起始文件路径
- topic: 起始节点主题
- direction: 导航方向
- totalLinks: 查找到的链接总数
- links: 链接列表，每条包含 linkText、targetPath、status
- truncated: 是否因结果过多被截断

**使用示例**:
\`\`\`
工具调用: md_navigate({ path: "docs/intro.md", direction: "outbound", depth: 1 })
\`\`\`

### 4. md_files — 文件全貌

**何时使用**: 首次进入项目或不熟悉文档结构时，了解所有已索引 MD 文件的分布和主题。

**返回内容**:
- 按目录层级组织的文件树
- 每个文件的 H1 标题主题和外链数量
- 最近 30 分钟内新增(✚)和修改(✎)的文件标记
- 顶部显示最近 30 分钟的变更统计摘要

**使用示例**:
\`\`\`
工具调用: md_files({})
\`\`\`

## 四、_next 解读

搜索结果中的 headingPath 和 lineRanges 字段可用于按路径导航到特定文档位置：
- headingPath: 节点所在标题路径（如 "Introduction > Getting Started"），可用于构建文档目录。
- 当搜索结果中 stale=true 时，建议先调用 md_status 确认索引状态，再使用 md_navigate 查看相关文件的链接关系。

## 五、stale（过期数据）解读

当知识库文件在索引后被修改，相关数据会被标记为 stale：
- 搜索结果中的 stale=true 表示部分文件可能已过期，建议在关键查询后触发重新索引。
- staleFileCount 表示过期文件数量。
- 过期数据仍然可用，只是可能不是最新版本。AI 客户端应在返回结果时提示用户数据可能存在延迟。

## 六、错误恢复

- 参数错误: 工具会返回 isError=true 的 ErrorResponse，提示缺失或无效的参数。
- 内部错误: 工具会返回 isError=true 的 ErrorResponse，附带有问题描述、可能的原因和修复建议。
- 节点/文件不存在: md_navigate 会返回空结果而非错误，方便 AI 客户端继续处理。
- 空搜索: md_search 遇到空查询会返回空结果而非错误。`; }

/**
 * 获取工具定义的 JSON 表示（用于 MCP 协议 tools/list）
 */
export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}> {
  return [
    {
      name: 'md_status',
      description: 'CHANGE AWARENESS ENTRY — call FIRST each session. Shows which MD files were recently added, modified, or deleted, grouped into time batches (±15 min). Returns file paths, line ranges, bold/italic/code terms, and heading context. NOT a debug tool — this is how you discover what changed since you last looked. For keyword search, use md_search. To read changed files, use your Read tool.',
      inputSchema: {
        type: 'object',
        properties: {
          batches: {
            type: 'number',
            description: 'Number of time batches to show (default: 3). Each batch groups files changed within ±15 minutes of each other.',
          },
          since: {
            type: 'string',
            description: "ISO 8601 timestamp. Only show changes after this time (e.g. '2026-06-03T14:00:00Z').",
          },
          limit: {
            type: 'number',
            description: 'Maximum files per batch (default: 50).',
          },
        },
        required: [],
      },
    },
    {
      name: 'md_search',
      description: 'Full-text keyword search across all indexed MD files. Returns file paths, line ranges, heading context, and content snippets ordered by FTS5 relevance. More precise than Grep — matches are scoped to semantic MD blocks (headings, paragraphs, list items). For recent changes, call md_status first. For link relationships, use md_navigate. Snippets are truncated — always Read the actual file for complete context.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keywords (supports FTS5 boolean operators, e.g. "staleness", "混合存储")',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum results to return (default: 20, max: 50).',
          },
          type: {
            type: 'string',
            enum: ['heading', 'paragraph', 'code_block'],
            description: 'Filter by MD element type',
          },
          file: {
            type: 'string',
            description: 'Limit search to a specific file path',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'md_navigate',
      description: 'Document link relationship explorer. Shows which MD files a given file links to (outbound) or which files link to it (inbound). Returns target file paths, file topics (H1), and link text with source line numbers. For keyword search, use md_search. To read linked files, use your Read tool. Use depth parameter to expand traversal levels beyond direct links.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'number',
            description: '节点 ID（与 path 二选一）',
          },
          path: {
            type: 'string',
            description: '文件路径（与 nodeId 二选一）',
          },
          direction: {
            type: 'string',
            enum: ['inbound', 'outbound'],
            description: '导航方向',
          },
          depth: {
            type: 'number',
            description: '遍历深度（默认 1）',
          },
          maxResults: {
            type: 'number',
            description: '最大返回链接数（默认 20, 最大 100）',
          },
        },
        required: ['direction'],
      },
    },
    {
      name: 'md_files',
      description: 'FILE TREE OVERVIEW — shows all indexed MD files organized by directory. Returns file names, H1 topics, outbound link counts, and marks files recently added (✚) or modified (✎) within the last 30 minutes. Use at the start of a session to see the full document landscape. For keyword search, use md_search. For link relationships, use md_navigate. For detailed change info, use md_status.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}
