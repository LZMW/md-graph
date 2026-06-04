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
| md_status | 获取知识库索引状态 | 无 | 无 |
| md_search | 全文搜索匹配内容 | query | maxResults, offset, type, file |
| md_navigate | 浏览节点关系（入链/出链） | direction，以及 nodeId 或 path（二选一） | depth |

## 三、详细描述

### 1. md_status — 获取索引状态

**用途**: 了解当前知识库的整体索引情况。

**参数**: 无

**返回说明**:
- totalFiles: 已索引的文件总数
- totalNodes: 解析出的文档节点总数（标题、段落等）
- totalEdges: 提取的链接关系总数
- lastIndexedAt: 最后索引时间（ISO8601）
- stale: 是否存在过期文件
- staleFileCount: 过期文件数量

**使用示例**:
\`\`\`
工具调用: md_status({})
\`\`\`

### 2. md_search — 全文搜索

**用途**: 在知识库中搜索匹配内容，返回相关文件的片段和路径。

**参数说明**:
- query (string, 必填): 搜索关键词
- maxResults (number, 可选): 最大结果数（默认 10，最大 50）
- offset (number, 可选): 分页偏移
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

### 3. md_navigate — 浏览节点关系

**用途**: 浏览节点之间的链接关系，支持入链（谁链接到我）和出链（我链接到谁）两个方向。

**参数说明**:
- nodeId (number, 与 path 二选一): 起始节点 ID
- path (string, 与 nodeId 二选一): 起始文件路径
- direction (string, 必填): "inbound" 或 "outbound"
- depth (number, 可选): 遍历深度（默认 1，最大 30）

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

- 参数错误: 工具会返回 code=-32602 错误，提示缺失或无效的参数。
- 内部错误: 工具会返回 code=-32603 错误，附带有问题描述、可能的原因和修复建议。
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
      description: '获取知识库索引状态，包括文件数、节点数、链接数和最后索引时间',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'md_search',
      description: '在知识库中全文搜索匹配内容，返回相关文件片段和路径',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          maxResults: {
            type: 'number',
            description: '最大结果数（默认 10，最大 50）',
          },
          offset: {
            type: 'number',
            description: '分页偏移',
          },
          type: {
            type: 'string',
            enum: ['heading', 'paragraph', 'code_block'],
            description: '按节点类型过滤',
          },
          file: {
            type: 'string',
            description: '按文件路径精确过滤',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'md_navigate',
      description: '浏览节点之间的关系（入链/出链），支持路径和深度控制',
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
        },
        required: ['direction'],
      },
    },
  ];
}
