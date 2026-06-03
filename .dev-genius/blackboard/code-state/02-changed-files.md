# 变更文件清单 — 第 5-6 批: T-012, T-013, T-014, T-015, T-016, T-017

> gen: gen-1 | 更新时间: 2026-06-03T23:30:00+08:00

## 新增文件

| # | 文件路径 | 变更类型 | 变更行数 | 关联任务 | 说明 |
|---|----------|----------|----------|----------|------|
| 1 | `src/analysis/watcher.ts` | 新增 | +149 | T-012 | chokidar 文件监控 + debounce + pending set |
| 2 | `src/analysis/watcher.test.ts` | 新增 | +143 | T-012 | Watcher TDD 测试（5 个测试用例） |
| 3 | `src/md-graph.ts` | 新增 | +175 | T-013 | Facade 外观模式—连接全部子系统 |
| 4 | `src/md-graph.test.ts` | 新增 | +86 | T-013 | MdGraph TDD 测试（6 个测试用例） |
| 5 | `src/api/template.ts` | 新增 | +163 | T-014 | 自然语言模板引擎 |
| 6 | `src/api/template.test.ts` | 新增 | +109 | T-014 | TemplateEngine TDD 测试（12 个测试用例） |
| 7 | `src/api/mcp-server.ts` | 新增 | +307 | T-015 | MCP JSON-RPC 协议实现 + stdio 传输层 |
| 8 | `src/api/server-instructions.ts` | 新增 | +105 | T-015 | SERVER_INSTRUCTIONS + 工具定义 |
| 9 | `src/api/mcp-server.test.ts` | 新增 | +163 | T-015 | MCP Server TDD 测试（8 个测试用例） |
| 10 | `src/cli.ts` | 新增 | +212 | T-016 | Commander CLI — init/status/uninstall |
| 11 | `src/cli.test.ts` | 新增 | +107 | T-016 | CLI TDD 测试（7 个测试用例） |
| 12 | `src/index.ts` | 新增 | +8 | T-017 | 入口点 — 导出 MdGraph + CLI |
| 13 | `src/index.test.ts` | 新增 | +56 | T-017 | 入口点 TDD 测试（5 个测试用例） |

## 第 7 批新增文件 (T-018, T-019)

| # | 文件路径 | 变更类型 | 变更行数 | 关联任务 | 说明 |
|---|----------|----------|----------|----------|------|
| 14 | `README.md` | 新增 | +~180 | T-018 | 项目 README：简介、安装、CLI、MCP、架构 |
| 15 | `__tests__/integration.test.ts` | 新增 | +~400 | T-019 | S1-S6 集成测试（28 个测试用例） |

## Gate 5 验证报告

| # | 文件路径 | 变更类型 | 说明 |
|---|----------|----------|------|
| 16 | `blackboard/test-report/05-verification-batch567.md` | 新增 | S1-S6 逐项验证 + 全部回归 |
| 17 | `blackboard/test-report/test-INDEX.md` | 修改 | 更新子索引 |

## Gate 6 审查报告

| # | 文件路径 | 变更类型 | 说明 |
|---|----------|----------|------|
| 18 | `blackboard/review-report/02-code-review-batch567.md` | 新增 | 15 文件审查：8.5/10 |
| 19 | `blackboard/review-report/review-INDEX.md` | 修改 | 更新子索引 |

## Gate 4 更新

| # | 文件路径 | 变更类型 | 说明 |
|---|----------|----------|------|
| 20 | `blackboard/code-state/01-acceptance-checklist.md` | 修改 | 新增 T-018/T-019 验收标准 |
| 21 | `blackboard/code-state/02-changed-files.md` | 修改 | 当前文件 |
| 22 | `blackboard/code-state/03-tdd-evidence.md` | 修改 | 新增集成测试 TDD 证据 |
| 23 | `blackboard/code-state/04-coverage-analysis.md` | 修改 | 更新覆盖率 |
| 24 | `blackboard/code-state/code-INDEX.md` | 修改 | 更新子索引 |

## 变更统计

- **新增**: 18 文件 | **修改**: 6 文件 | **删除**: 0 文件
- **总变更**: +~2380/-~0 行
  - 批次 1-4: +~600 行
  - 批次 5-6: +1783 行
  - 批次 7 (T-018/T-019): +~580 行
  - 验证/审查报告: +~700 行

## 完整项目文件结构

```
src/
├── index.ts              # 入口点
├── types.ts              # 共享类型定义
├── cli.ts                # CLI（init/status/uninstall）
├── md-graph.ts           # Facade 外观模式
├── storage/
│   ├── schema.sql        # SQLite Schema
│   ├── database.ts       # SqliteDbAdapter
│   └── filestore.ts      # FileStore
└── analysis/
    ├── indexer.ts        # 索引协调
    ├── searcher.ts       # FTS5 搜索
    ├── traverser.ts      # BFS 导航
    ├── watcher.ts        # 文件监控 ★ 新增
    └── parser/
        ├── base-parser.ts
        ├── index.ts      # ParserRegistry
        └── md-parser.ts  # MarkdownParser
└── api/
    ├── template.ts       # 模板引擎 ★ 新增
    ├── mcp-server.ts     # MCP Server ★ 新增
    └── server-instructions.ts ★ 新增
```

## 依赖关系

| 模块 | 依赖 | 类型 |
|------|------|------|
| watcher | chokidar, Indexer | 运行时依赖 |
| MdGraph | FileStore, SqliteDbAdapter, ParserRegistry, Indexer, Searcher, Traverser, Watcher | 运行时依赖 |
| TemplateEngine | — | 无外部依赖 |
| McpServer | MdGraph, TemplateEngine, server-instructions | 运行时依赖 |
| CLI | commander, MdGraph | 运行时依赖 |
| index.ts | MdGraph, CLI | 入口依赖 |
