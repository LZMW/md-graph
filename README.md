# md-graph

> Markdown 知识图谱引擎 — 为 AI Agent 提供文档搜索、链接导航和变更感知

## 它是什么

在每个 Markdown 项目下建一个本地索引库（`.md-graph/index.db`），通过 MCP 协议让 Claude Code 直接搜索和导航你的文档。

**三个工具：**

| 工具 | 做什么 | 什么时候用 |
|------|--------|----------|
| `md_status` | 查看最近哪些文档变了 | 每次会话开始时 |
| `md_search` | 全文搜索关键词在哪些文件里 | 需要定位某个概念 |
| `md_navigate` | 查看文档之间的链接关系 | 理解文档引用链 |

## 安装（三步）

### 第一步：克隆并构建

```bash
git clone https://github.com/LZMW/md-graph.git
cd md-graph
npm install
npm run build
npm link
```

### 第二步：注册到 Claude Code

```bash
claude mcp add --transport stdio --scope user md-graph -- node /path/to/md-graph/dist/cli.js serve --mcp
```

`--scope user` 表示全局可用，所有项目都能用。这条命令只需执行一次。

### 第三步：建索引

```bash
cd /path/to/your/project
md-graph init
```

重复第三步给每个想用的项目建索引。

**完。** 重启 Claude Code 后 agent 就能用 `md_status`/`md_search`/`md_navigate` 了。

## 工作原理

```
你的项目/
├── docs/
│   ├── guide.md        ← 被索引
│   └── api.md
├── .md-graph/           ← md-graph init 创建
│   └── index.db         ← SQLite FTS5 索引
```

Claude Code 启动 MCP 服务器时会给它 `CLAUDE_PROJECT_DIR` 环境变量（指向当前项目根目录），服务器自动找 `.md-graph/` 打开索引。换项目自动切换到对应索引。

## CLI 命令

| 命令 | 作用 |
|------|------|
| `md-graph init [dir]` | 建索引 |
| `md-graph status [dir]` | 看索引状态 |
| `md-graph serve --mcp` | 启动 MCP 服务器 |
| `md-graph install` | 自动写入 MCP 配置（备用） |
| `md-graph uninstall [dir]` | 删除索引目录 |

## 数据库

`.md-graph/index.db`（SQLite），四张表：

| 表 | 内容 |
|----|------|
| `files` | 文件元数据（路径、hash、mtime、大小） |
| `doc_nodes` | 块级元素（标题、段落、代码块、列表项等） |
| `doc_node_content` | searchable 节点的全文（FTS5 索引源） |
| `edges` | Markdown 链接（`[text](target)`） |

## 技术栈

TypeScript · Node.js · SQLite FTS5 · markdown-it · chokidar · commander · MCP (JSON-RPC 2.0)
