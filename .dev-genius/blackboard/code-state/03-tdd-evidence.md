# TDD 证据 — 第 5-6 批: T-012, T-013, T-014, T-015, T-016, T-017

> gen: gen-1 | 更新时间: 2026-06-03T23:30:00+08:00

## T-012 FileWatcher

### RED 阶段
**测试命令**: `npx tsx --test src/analysis/watcher.test.ts`
**预期结果**: FAIL（`src/analysis/watcher.ts` 不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../watcher.js'
```
**确认**: 失败原因正确（模块不存在）

### GREEN 阶段
**测试命令**: `npx tsx --test src/analysis/watcher.test.ts`
**实际输出**:
```
▶ FileWatcher
  ✔ constructor — 应使用依赖创建 Watcher
  ✔ fileChange — 文件变更应加入 pending set
  ✔ debounce — 多次变更应合并为一次索引
  ✔ stalenessCheck — 应检测 4 个字段的过时状态
  ✔ isMdFile — 应正确判断 .md 文件
✔ FileWatcher
ℹ tests 5, pass 5, fail 0
```

## T-013 MdGraph Facade

### RED 阶段
**测试命令**: `npx tsx --test src/md-graph.test.ts`
**预期结果**: FAIL（`src/md-graph.ts` 不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../md-graph.js'
```

### GREEN 阶段
**测试命令**: `npx tsx --test src/md-graph.test.ts`
**实际输出**:
```
▶ MdGraph
  ✔ constructor — 应使用 rootPath 创建 MdGraph 实例
  ✔ status — 应返回索引状态信息
  ✔ search — 应返回搜索结果
  ✔ navigate — 应返回导航结果
  ✔ navigate — 应支持三种方向
  ✔ search — 空查询应返回空结果
✔ MdGraph
ℹ tests 6, pass 6, fail 0
```

## T-014 TemplateEngine

### RED 阶段
**测试命令**: `npx tsx --test src/api/template.test.ts`
**预期结果**: FAIL（`src/api/template.ts` 不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../template.js'
```

### GREEN 阶段
**测试命令**: `npx tsx --test src/api/template.test.ts`
**实际输出**:
```
▶ TemplateEngine
  ✔ render — 应替换 {{变量名}} 为变量值
  ✔ render — 应替换多个不同的变量
  ✔ render — 未提供的变量应保留原样
  ✔ render — {{#if var}} 条件为真时应渲染内容
  ✔ render — {{#if var}} 条件为假时应隐藏内容
  ✔ render — {{#if var}} 变量不存在时应隐藏内容
  ✔ render — {{#unless var}} 条件为假时应渲染内容
  ✔ render — {{#unless var}} 条件为真时应隐藏内容
  ✔ render — {{_next label:query}} 应生成引导链接
  ✔ renderTemplate — md_status 应渲染状态信息
  ✔ renderTemplate — md_search 应渲染搜索结果
  ✔ renderTemplate — md_navigate 应渲染导航结果
✔ TemplateEngine
ℹ tests 12, pass 12, fail 0
```

## T-015 MCP Server

### RED 阶段
**测试命令**: `npx tsx --test src/api/mcp-server.test.ts`
**预期结果**: FAIL（模块不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../mcp-server.js'
Cannot find module '.../server-instructions.js'
```

### GREEN 阶段
**测试命令**: `npx tsx --test src/api/mcp-server.test.ts`
**实际输出**:
```
▶ McpServer
  ✔ constructor — 应使用 MdGraph 创建 McpServer
  ✔ handleRequest — initialize 应返回协议版本
  ✔ handleRequest — tools/list 应返回工具列表
  ✔ handleRequest — tools/call md_status 应返回状态
  ✔ handleRequest — tools/call md_search 应返回搜索结果
  ✔ handleRequest — tools/call md_search 缺少参数应返回错误
  ✔ handleRequest — 未知方法应返回错误
✔ McpServer
▶ createServerInstructions
  ✔ 应生成包含 3 个工具的说明文本
✔ createServerInstructions
ℹ tests 8, pass 8, fail 0
```

## T-016 CLI

### RED 阶段
**测试命令**: `npx tsx --test src/cli.test.ts`
**预期结果**: FAIL（`src/cli.ts` 不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../cli.js'
```

### GREEN 阶段
**测试命令**: `npx tsx --test src/cli.test.ts`
**实际输出**:
```
▶ CLI
  ✔ createCli — 应返回 Commander 程序实例
  ✔ cmdInit — 应初始化新仓库
  ✔ cmdInit — 重复初始化应返回失败
  ✔ cmdStatus — 初始化后应返回状态
  ✔ cmdStatus — 未初始化应返回失败
  ✔ cmdUninstall — 应删除存储目录
  ✔ cmdUninstall — 未初始化时应返回失败
✔ CLI
ℹ tests 7, pass 7, fail 0
```

## T-017 Entry Point

### RED 阶段
**测试命令**: `npx tsx --test src/index.test.ts`
**预期结果**: FAIL（`src/index.ts` 不存在）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../index.js'
```

### GREEN 阶段
**测试命令**: `npx tsx --test src/index.test.ts`
**实际输出**:
```
▶ Entry Point (index.ts)
  ✔ 应导出 MdGraph 类
  ✔ 应导出 createCli 函数
  ✔ 应导出 runCli 函数
  ✔ 应导出 main 函数
  ✔ MdGraph 应能创建实例
✔ Entry Point (index.ts)
ℹ tests 5, pass 5, fail 0
```

## 完整回归

**测试命令**:
```
npx tsx --test src/storage/filestore.test.ts src/storage/database.test.ts \
  src/analysis/parser/parser.test.ts src/analysis/parser/md-parser.test.ts \
  src/analysis/indexer.test.ts src/analysis/searcher.test.ts \
  src/analysis/traverser.test.ts src/analysis/watcher.test.ts \
  src/md-graph.test.ts src/api/template.test.ts src/api/mcp-server.test.ts \
  src/cli.test.ts src/index.test.ts
```

**实际输出**:
```
ℹ tests 171, suites 15, pass 171, fail 0
```

**TypeScript 编译**: `npx tsc --noEmit` — 零错误

## T-019 Integration Tests

### RED 阶段
**测试命令**: `npx tsx --test __tests__/integration.test.ts`
**预期结果**: FAIL（文件尚未创建）
**实际输出**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../__tests__/integration.js'
```
**确认**: 失败原因正确（文件不存在）

### GREEN 阶段
**测试命令**: `npx tsx --test __tests__/integration.test.ts`
**实际输出**:
```
▶ S1: 变更感知 (status)
  ✔ S1-TC01 — init 后 status 应报告正确的文件数和节点数
  ✔ S1-TC02 — 文件变更后 stale 标记应为 true
  ✔ S1-TC03 — status 返回 staleness 信息格式正确
▶ S2: 精确搜索 (search)
  ✔ S2-TC01 — 搜索存在的关键词应返回匹配结果
  ✔ S2-TC02 — 搜索不存在的词应返回空结果
  ✔ S2-TC03 — 搜索应返回带 snippet 的结果
  ✔ S2-TC04 — 搜索结果应包含 headingPath 信息
  ✔ S2-TC05 — 空搜索词应返回空结果
  ✔ S2-TC06 — 搜索结果应按 score 降序排列
▶ S3: 文档导航 (navigate)
  ✔ S3-TC01 — outbound 导航应返回出链
  ✔ S3-TC02 — inbound 导航应返回入链
  ✔ S3-TC03 — impact 导航应返回出链和入链的并集
  ✔ S3-TC04 — 导航返回的链接应包含 linkText 和状态
  ✔ S3-TC05 — 不存在的 nodeId 应返回空导航结果
▶ S4: 大文件处理
  ✔ S4-TC01 — 大文件（1000 行）应能正常索引
  ✔ S4-TC02 — 大文件内容可搜索
  ✔ S4-TC03 — 大文件搜索结果正确包含 section 标题信息
  ✔ S4-TC04 — 混合扫描不影响搜索结果
▶ S5: 并发安全
  ✔ S5-TC01 — 并发搜索不抛出异常
  ✔ S5-TC02 — 边搜索边索引不崩溃
  ✔ S5-TC03 — 多次调用 close 不报错（幂等性）
  ✔ S5-TC04 — 连续 status 调用应幂等
▶ S6: CLI 命令
  ✔ S6-TC01 — init 命令应创建 .md-graph 目录和 index.db
  ✔ S6-TC02 — 重复 init 应返回失败
  ✔ S6-TC03 — status 命令应返回索引信息
  ✔ S6-TC04 — uninstall 命令应删除存储目录
  ✔ S6-TC05 — 未初始化时 status 应返回失败
  ✔ S6-TC06 — 未初始化时 uninstall 应返回失败
ℹ tests 28, suites 6, pass 28, fail 0
```

### REFACTOR 阶段
**测试命令**: `npx tsx --test src/storage/filestore.test.ts src/storage/database.test.ts src/analysis/parser/parser.test.ts src/analysis/parser/md-parser.test.ts src/analysis/indexer.test.ts src/analysis/searcher.test.ts src/analysis/traverser.test.ts src/analysis/watcher.test.ts src/md-graph.test.ts src/api/template.test.ts src/api/mcp-server.test.ts src/cli.test.ts src/index.test.ts __tests__/integration.test.ts`
**实际输出**:
```
ℹ tests 199
ℹ suites 21
ℹ pass 199
ℹ fail 0
```
**确认**: 重构后全部 199 测试保持绿色
