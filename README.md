# md-graph

### Markdown 知识图谱引擎 — 为 AI Agent 提供文档全文搜索、链接导航和变更感知

**~54% 更快 · ~71% 更少工具调用 · 100% 本地**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Windows](https://img.shields.io/badge/Windows-supported-blue.svg)](#)
[![macOS](https://img.shields.io/badge/macOS-supported-blue.svg)](#)
[![Linux](https://img.shields.io/badge/Linux-supported-blue.svg)](#)
[![Claude Code](https://img.shields.io/badge/Claude_Code-supported-blueviolet.svg)](#)

## 快速开始

```bash
# 安装
git clone https://github.com/LZMW/md-graph.git && cd md-graph
npm install && npm run build && npm link

# 注册 MCP 服务器（全局一次）
claude mcp add --transport stdio --scope user md-graph -- node /path/to/md-graph/dist/cli.js serve --mcp

# 给项目建索引
cd /path/to/your/project
md-graph init

# 重启 Claude Code 即可使用
```

<sub>md-graph 启动时自动开启文件监控，项目中的 MD 文件增删改后索引秒级增量更新，无需手动操作。`--scope user` 让 md-graph 在所有项目中可用——Claude Code 启动时自动注入 `CLAUDE_PROJECT_DIR` 环境变量，服务器据此自动发现项目索引。</sub>

### 卸载

```bash
md-graph uninstall                    # 删除项目索引
claude mcp remove md-graph            # 移除 MCP 注册
```

---

## 为什么用 md-graph？

当 Claude Code 在 Markdown 文档项目中搜索内容时，通常用 Grep 扫描文件、Read 读取内容——每次工具调用都消耗 token。

**md-graph 给 agent 一个预索引的知识图谱**——文档节点、标题层级、链接关系全部在 SQLite 中。agent 一次 `md_search` 就能定位到相关段落，一次 `md_navigate` 就能看到完整链接关系图，无需逐个文件 Read + Grep。

### 与直接搜索的对比

| 场景 | 不用 md-graph | 用 md-graph |
|------|-------------|-----------|
| 查找"staleness"概念 | Grep 所有文件 → Read 匹配行 | `md_search("staleness")` → 一次调用得到 BM25 排序的精确段落 |
| 了解文档引用关系 | Read 每个文件 → 人工追踪链接 | `md_navigate(path, "outbound")` → 一次调用得到完整链接图 |
| 感知文档变更 | 没有标准方式 | `md_status()` → 按 ±15 分钟窗口分组的变更批次 |

### 核心设计哲学

**md-graph 只负责定位，Read 负责阅读。** md_status 定位变更 → agent 用 Read 读取变更内容；md_search 定位搜索命中 → agent 用 Read 读取命中段落；md_navigate 定位关联文档 → agent 用 Read 读取关联文档。md-graph 不做超越"定位"能力的事——那是 Read 工具的工作。

---

## 核心功能

| | |
|---|---|
| **变更感知** | 每次会话首先调用 `md_status`，按 ±15 分钟窗口分组显示最近增删改的文档。chokidar 文件监控自动增量索引，索引始终接近实时 |
| **全文搜索** | SQLite FTS5 毫秒级搜索，BM25 相关度排序。比 Grep 更精确——匹配限定在语义 MD 块（段落、标题、列表项）而非原始文本行 |
| **链接导航** | 自动解析 `[text](path)` 链接，支持入链/出链 BFS 多级遍历。每个链接返回目标文件主题（H1 标题）和源行号 |
| **Staleness 新鲜度合约** | 每个 MCP 响应末尾嵌入 `索引状态: 新鲜/过期 \| 过期文件数: N \| 最后索引时间`。stat-only 4 字段检查（mtime + size + exists + db_has_record），零 IO 开销 |
| **自然语言输出** | 所有 MCP 工具返回自然语言模板文本，非 JSON 数组。`【务必】`/`【不要】` 引导块帮助 agent 正确规划下一步 |
| **100% 本地** | 数据不离开本机。无需 API key。无需外部服务。纯 SQLite 数据库 |

### 自动同步机制

```
文件编辑保存
  → chokidar 检测到 change 事件 (<100ms)
  → debounce (300ms) 合并批量变更
  → Indexer 增量更新改动的文件
  → MD 解析 → SQLite 写入
  → 下一次 agent 查询看到最新数据
```

**连接时追赶**: MCP 服务器启动时，MdGraph.status() 运行增量索引确保编辑器的离线修改被吸收。**Staleness 信号**: 如果 debounce 窗口中有待处理的文件，MCP 响应末尾的 staleness 行会标记为"过期"，agent 据此判断是否需要 Read 最新文件。

验证：`md-graph status --verbose` 或直接用 MCP 工具 `md_status()`。

---

## MCP 工具

| 工具 | 意图（你想做什么） | 示例 |
|------|-------------------|------|
| `md_status` | 查看最近变更文档和索引状态 | `md_status({ batches: 2 })` |
| `md_search` | 跨所有 MD 文件全文搜索关键词 | `md_search({ query: "staleness" })` |
| `md_navigate` | 浏览文档的出链/入链关系 | `md_navigate({ path: "docs/guide.md", direction: "outbound" })` |

### md_status — 变更感知入口

每次会话第一个调用的工具。按 ±15 分钟窗口分组显示最近增删改的 MD 文件。

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `batches` | number | 否 | 3 | 时间批次数量 |
| `since` | string | 否 | — | ISO 8601 时间戳，仅显示之后的变更 |
| `limit` | number | 否 | 50 | 每批次最大文件数 |

### md_search — 全文搜索

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `query` | string | 是 | — | 搜索关键词（支持 FTS5 布尔操作符） |
| `maxResults` | number | 否 | 20 | 最大结果数（最大 50） |
| `type` | string | 否 | — | 过滤：`heading` / `paragraph` / `code_block` |
| `file` | string | 否 | — | 限定搜索指定文件路径 |

### md_navigate — 链接关系探索

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `path` | string | 与 nodeId 二选一 | — | 起始文件路径 |
| `nodeId` | number | 与 path 二选一 | — | 起始节点 ID |
| `direction` | string | 是 | — | `inbound` / `outbound` |
| `depth` | number | 否 | 1 | BFS 遍历深度（最大 30） |
| `maxResults` | number | 否 | 20 | 最大返回链接数（最大 100） |

---

## CLI 参考

```bash
md-graph init [dir] [--force]        # 初始化或更新索引。默认增量，--force 全量重建
md-graph status [dir] [--verbose]     # 索引健康检查 + staleness 报告
md-graph uninstall [dir] [--keep-db]  # 删除索引。--keep-db 仅移除配置保留数据库
md-graph serve --mcp [--path <dir>]   # 启动 MCP stdio 服务器
```

| 规范 | 值 |
|------|-----|
| stdout | 纯 JSON（无 ANSI、无进度条） |
| stderr | 仅文本错误 |
| exit code | 0=完全成功, 1=部分成功, 2=完全失败 |

---

## 项目自动发现

服务器按三层优先级查找项目索引：
1. `--path` 显式指定
2. `CLAUDE_PROJECT_DIR` 环境变量（Claude Code 自动注入）
3. `cwd` 向上遍历查找 `.md-graph/` 目录

未找到项目时服务器仍正常运行，工具调用返回友好的初始化提示。

---

## 排除规则

索引和文件监控默认跳过以下目录，无需配置：

- 隐藏目录（`.` 开头，除 `.md` 文件外）
- `node_modules` / `vendor` / `venv`
- `dist` / `build` / `target` / `.next`

---

## 架构

```
agent MCP 请求
  → MCP Server (JSON-RPC 2.0)
    → MdGraph Facade
      → Searcher (FTS5) / Traverser (BFS) / Indexer (Watcher)
        → SqliteDbAdapter (better-sqlite3) + FileStore + Staleness
```

## 数据库

每个项目在 `.md-graph/index.db` 中创建 SQLite 数据库：

| 表 | 内容 |
|----|------|
| `files` | 文件元数据（路径、哈希、大小、修改时间） |
| `doc_nodes` | 文档节点（7 类：document/heading/paragraph/list_item/code_block/blockquote/table_row） |
| `doc_node_content` | 节点全文（仅 searchable 节点） |
| `edges` | 链接边（link-only 模型，拒绝 contains/reference） |
| `nodes_fts` | FTS5 全文搜索虚拟表（自动触发器同步） |

---

## 开发

```bash
npm run build          # tsc + 复制 schema.sql
npm test               # 149 个测试
npx tsc --noEmit       # 类型检查
```

## 技术栈

- **运行时**: Node.js >= 22
- **语言**: TypeScript (ESM)
- **搜索**: SQLite FTS5 (better-sqlite3)
- **MD 解析**: markdown-it
- **文件监控**: chokidar
- **CLI**: commander
- **协议**: MCP / JSON-RPC 2.0

## 故障排除

**"md-graph 未初始化"** — 在项目目录下运行 `md-graph init` 创建索引。

**MCP 服务器连接失败** — 确保项目已运行过 `md-graph init`，验证 MCP 配置中路径正确：`claude mcp list` 检查。也可以在命令行测试：`echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | node dist/cli.js serve --mcp`。

**搜索结果过时** — 每个 MCP 响应末尾有 staleness 元数据行。若显示"过期"，文件监控会自动增量更新（等待 300ms debounce 窗口）。若 watcher 未运行，运行 `md-graph init` 手动更新。

**数据库锁定** — better-sqlite3 使用同步 API，并发读取不会阻塞。若遇到锁定，检查是否有其他进程同时写入。

**索引了不需要的目录** — 将不需要的目录添加到 `.gitignore`，或在项目外运行 `md-graph init`。

## 许可证

MIT
