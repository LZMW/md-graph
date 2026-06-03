// =============================================================================
// SERVER_INSTRUCTIONS — MCP 服务器使用说明
// 描述 md-graph MCP 服务器的 3 个工具及其用法
// =============================================================================

/**
 * 生成 MCP 服务器使用说明
 * 包含 3 个工具的详细用法描述，供 AI 客户端理解 md-graph 的能力
 */
export function createServerInstructions(): string {
  return `# md-graph MCP Server — 知识图谱工具

md-graph 是一个 Markdown 知识图谱引擎，提供以下 3 个 MCP 工具：

## 1. md_status
获取当前知识库的索引状态。

**参数**: 无
**返回**: 索引的文件数、节点数、链接数、最后索引时间

**使用示例**:
\`\`\`
用户: "当前知识库状态如何？"
工具调用: md_status({})
\`\`\`

## 2. md_search
在知识库中全文搜索匹配内容。

**参数**:
- \`query\` (string, 必填): 搜索关键词
- \`maxResults\` (number, 可选): 最大结果数 (默认 10, 最大 50)
- \`offset\` (number, 可选): 分页偏移

**使用示例**:
\`\`\`
用户: "搜索关于安装的文档"
工具调用: md_search({ query: "安装" })
\`\`\`

## 3. md_navigate
浏览节点之间的关系（入链/出链/全部影响）。

**参数**:
- \`nodeId\` (number, 必填): 节点 ID
- \`direction\` (string, 必填): "inbound" | "outbound" | "impact"
- \`depth\` (number, 可选): 遍历深度 (默认 1)

**使用示例**:
\`\`\`
用户: "查看文件 A 链接到了哪些文件"
工具调用: md_navigate({ nodeId: 1, direction: "outbound", depth: 1 })
\`\`\`

所有工具返回自然语言描述的结果，方便对话式理解。`;
}

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
        },
        required: ['query'],
      },
    },
    {
      name: 'md_navigate',
      description: '浏览节点之间的关系（入链/出链/全部影响），支持深度控制',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'number',
            description: '节点 ID',
          },
          direction: {
            type: 'string',
            enum: ['inbound', 'outbound', 'impact'],
            description: '导航方向',
          },
          depth: {
            type: 'number',
            description: '遍历深度（默认 1）',
          },
        },
        required: ['nodeId', 'direction'],
      },
    },
  ];
}
