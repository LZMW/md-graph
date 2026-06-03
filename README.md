# md-graph

Markdown knowledge graph engine — 为您的 Markdown 文件建立全文索引、链接导航和变更感知能力。

## 简介

md-graph 是一个基于 SQLite FTS5 的 Markdown 知识图谱引擎，专为 AI Agent 和开发者设计。它将 Markdown 文件目录转换为可搜索、可导航的知识图谱：

- **全文搜索**：基于 SQLite FTS5 的毫秒级全文搜索，支持 ranking 排序和 snippet 生成
- **链接导航**：自动解析 Markdown 链接（`[text](path)`），支持 inbound/outbound/impact 三方向 BFS 导航
- **变更感知**：文件变更自动检测和增量索引，跟踪过时状态
- **MCP 协议**：完整的 MCP (Model Context Protocol) 服务器，可供任何 MCP 客户端集成
- **CLI 接口**：简洁的命令行工具，JSON-only 输出，适合脚本调用

## 安装

```bash
npm install md-graph
```

## 快速开始

### 1. 初始化仓库

```bash
md-graph init /path/to/your/markdown/project
```

### 2. 查询索引状态

```bash
md-graph status /path/to/your/markdown/project
```

### 3. 以 MCP 服务器模式运行

```bash
npx md-graph mcp /path/to/your/markdown/project
```

## CLI 命令

| 命令 | 描述 | 参数 | 输出 |
|------|------|------|------|
| `init` | 初始化新的 md-graph 仓库 | `[dir]` 项目根目录（默认 `.`） | JSON `{ success, message, storageDir }` |
| `status` | 显示索引状态 | `[dir]` 项目根目录（默认 `.`） | JSON `{ success, totalFiles, totalNodes, totalEdges, lastIndexedAt, stale, staleFileCount }` |
| `uninstall` | 删除 md-graph 存储目录 | `[dir]` 项目根目录（默认 `.`） | JSON `{ success, message }` |

所有命令均输出纯 JSON 到 stdout，错误信息输出到 stderr。

## MCP 工具

md-graph 实现了一个完整的 MCP (Model Context Protocol) 服务器，提供以下 3 个工具：

### md_status

返回当前索引仓库的状态信息。

**参数**: 无

**返回**: 索引状态（文件数、节点数、边数、最后索引时间、过时状态）

### md_search

对 Markdown 仓库执行全文搜索。

**参数**:
| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `query` | string | 是 | — | 搜索关键词 |
| `maxResults` | number | 否 | 10 | 最大结果数（最大 50） |
| `offset` | number | 否 | 0 | 分页偏移量 |

**返回**: 搜索结果列表（含文件路径、heading 路径、内容摘要、匹配分数）

### md_navigate

在知识图谱中沿链接导航。

**参数**:
| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `nodeId` | number | 是 | — | 起始节点 ID |
| `direction` | string | 是 | — | 导航方向：`inbound` / `outbound` / `impact` |
| `depth` | number | 否 | 1 | BFS 遍历深度 |

**返回**: 导航结果（源节点信息、链接列表、每个链接的目标路径和状态）

## 架构

```
┌────────────────────────────────────────────────────┐
│                   入口层 (index.ts)                   │
├──────────────┬─────────────────────────────────────┤
│   CLI (cli.ts) │        MCP Server (mcp-server.ts)    │
├──────────────┴─────────────────────────────────────┤
│               外观层 MdGraph (md-graph.ts)            │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Indexer  │ │ Searcher │ │Traverser │ │Watcher │ │
│  └─────┬────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
├────────┴──────────┴────────────┴────────────┴──────┤
│           存储层 FileStore + SqliteDbAdapter         │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │   文件系统    │  │  SQLite FTS5 (index.db)      │  │
│  └─────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 模块说明

| 模块 | 作用 | 依赖 |
|------|------|------|
| **FileStore** | 文件系统存取、递归扫描、SHA-256 哈希 | Node.js 内置 |
| **SqliteDbAdapter** | SQLite 封装、CRUD、FTS5 搜索、BFS 递归导航 | better-sqlite3 |
| **ParserRegistry** | Markdown 解析器注册和调度 | markdown-it |
| **Indexer** | 全量/增量/重建三种索引模式 | FileStore + SqliteDbAdapter + Parser |
| **Searcher** | FTS5 全文搜索、snippet 生成、分数排序 | SqliteDbAdapter |
| **Traverser** | BFS 三方向 (inbound/outbound/impact) 导航 | SqliteDbAdapter |
| **Watcher** | chokidar 文件监控 + debounce + pending set | chokidar + Indexer |
| **MdGraph** | Facade 外观模式，连接所有子系统 | 全部分析/存储模块 |
| **MCP Server** | JSON-RPC 2.0 协议实现 | MdGraph + TemplateEngine |
| **TemplateEngine** | 模板引擎：变量插值、条件块、引导标签 | 无外部依赖 |
| **CLI** | commander 命令行接口 | commander + MdGraph |

## 数据库 Schema

md-graph 在每个项目目录的 `.md-graph/index.db` 中创建 SQLite 数据库，包含以下表：

- **files** — 文件元数据（路径、哈希、大小、修改时间）
- **doc_nodes** — 文档节点（段落、标题、列表项、代码块等）
- **doc_node_content** — 节点全文内容（FTS5 搜索用）
- **edges** — 链接边（解析的 Markdown 链接）

## 开发

```bash
# 构建
npm run build

# 开发（热重载 MCP 服务器）
npm run dev

# 运行测试
npx tsx --test src/**/*.test.ts

# TypeScript 类型检查
npx tsc --noEmit
```

## 技术栈

- **运行时**: Node.js >= 22
- **语言**: TypeScript (ESM)
- **搜索**: SQLite FTS5
- **Markdown 解析**: markdown-it
- **文件监控**: chokidar
- **CLI**: commander
- **协议**: MCP (Model Context Protocol) / JSON-RPC 2.0
