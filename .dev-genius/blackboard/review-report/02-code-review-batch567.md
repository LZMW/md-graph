# 代码审查报告 — 第 5-6-7 批: T-012 ~ T-019

> gen: gen-1 | 审查时间: 2026-06-03T23:35:00+08:00
> 审查方法: Karpathy 四原则 + OWASP 安全 + 架构合规性（ADR 对照）

## 审查范围

| 文件 | 行数 | 语言 | 用途 | 批次 |
|------|------|------|------|------|
| `src/analysis/watcher.ts` | 157 | TypeScript | chokidar 文件监控 + debounce | T-012 |
| `src/analysis/watcher.test.ts` | 143 | TypeScript | Watcher 单元测试 | T-012 |
| `src/md-graph.ts` | 196 | TypeScript | Facade 外观模式 | T-013 |
| `src/md-graph.test.ts` | 98 | TypeScript | Facade 测试 | T-013 |
| `src/api/template.ts` | 190 | TypeScript | 模板引擎 | T-014 |
| `src/api/template.test.ts` | 137 | TypeScript | 模板引擎测试 | T-014 |
| `src/api/mcp-server.ts` | 359 | TypeScript | MCP JSON-RPC 服务器 | T-015 |
| `src/api/mcp-server.test.ts` | 165 | TypeScript | MCP 服务器测试 | T-015 |
| `src/api/server-instructions.ts` | 127 | TypeScript | MCP 使用说明 + 工具定义 | T-015 |
| `src/cli.ts` | 213 | TypeScript | Commander 命令行接口 | T-016 |
| `src/cli.test.ts` | 121 | TypeScript | CLI 测试 | T-016 |
| `src/index.ts` | 9 | TypeScript | 入口点 | T-017 |
| `src/index.test.ts` | 47 | TypeScript | 入口点测试 | T-017 |
| `README.md` | ~180 | Markdown | 项目 README | T-018 |
| `__tests__/integration.test.ts` | ~400 | TypeScript | S1-S6 集成测试 | T-019 |

---

## 第一部分: Karpathy 四原则审查

### 1.1 简洁性 (Simplicity) — 评分: 8.5/10

**优点**:
- **Watcher** (watcher.ts): 职责单一——只负责文件变更事件的监控和 debounce。`stalenessCheck` 只依赖 stat 而非全文读取，符合"最少操作"原则。构造函数仅 3 个参数，API 简洁。
- **MdGraph Facade** (md-graph.ts): 清晰的 Facade 模式，对外暴露 5 个方法 (init/status/search/navigate/fullIndex/close)，内部连接 5 个子系统。每个方法实现不超过 15 行。
- **TemplateEngine** (template.ts): 模板 parse 使用正则一次遍历，逐步替换。4 个内部方法各处理一种语法（变量/条件/循环/_next），分离清晰。
- **ServerInstructions** (server-instructions.ts): 纯函数，无状态，无依赖。`createServerInstructions` 和 `getToolDefinitions` 两个导出函数职责分明。
- **CLI** (cli.ts): 3 个命令 handler 函数 + createCli + runCli 分离，handler 返回纯 JSON 对象便于测试。

**问题**:
1. (R-01) `cli.ts:179-201` — `runCli` 使用猴子补丁 (monkey-patch) 替换 `process.stdout.write` 和 `process.cwd`，虽然能工作但脆弱。如果 commander parseAsync 内部异步操作使用了不同的 process 引用，补丁可能失效。建议将 stdout 作为参数注入。
2. (R-02) `mcp-server.ts:318-358` — `startStdioServer` 函数紧耦合于 MdGraphFacade 类型，使用了原始 stdin/stdout 事件驱动模式。该函数不含错误恢复逻辑，stdin 解析失败的行被静默丢弃。

### 1.2 正确性 (Correctness) — 评分: 9/10

**优点**:
- **Watcher**: debounce 机制正确（clear + setTimeout 模式）。`stalenessCheck` 的 4 字段判定（path/size/mtimeMs/existence）准确。`isMdFile` 覆盖 `.md`、`.MD`、`.mdx`。
- **MdGraph Facade**: `ensureInitialized` 惰性初始化，避免重复初始化。`status()` 中增量索引异常不影响状态查询（try-catch 包裹）。
- **TemplateEngine**: 渲染顺序正确：先 _next → each → if/unless → 变量插值，避免嵌套标签误解析。未提供的变量保留原样，行为直观。
- **MCP Server**: JSON-RPC 2.0 协议实现完整（initialize/tools/list/tools/call + 错误码 -32601/-32602/-32603）。
- **CLI**: `exitOverride()` 防止 process.exit 在测试中终止进程。所有命令 handler 使用 try-catch 捕获异常。

**发现的问题**:
1. (R-03) `watcher.ts:113-117` — `isMdFile` 是私有方法，但在测试中通过 `(w as any)` 访问。测试使用了 `(w as any).onFileChange` 访问 protected 方法。这打破了封装约定，但好在测试覆盖了关键逻辑。建议将 `isMdFile` 改为公开或 `@visibleForTesting` 风格。

### 1.3 一致性 (Consistency) — 评分: 9/10

**优点**:
- 所有文件遵循相同的头部注释格式（`// ==========...`）。
- 所有测试文件使用相同的测试框架结构（`describe/it/before/after` + `import` pattern）。
- 所有异步方法统一使用 `async/await`，无 Promise.then 混用。
- 命名统一：文件系统相关使用 `path`、`rootPath`、`relativePath`；数据库相关使用 `insert/get/delete` 前缀。
- 所有类使用 `public/private` 修饰符，内部方法标记 `private`。

**问题**:
1. (R-04) `mcp-server.ts:143-147` — `handleInitialize` 的返回类型是 `JsonRpcResponse`，但参数名 `request` 未使用 `readonly`。整个文件对 `JsonRpcRequest` 的处理一致性良好，但少数地方在调用后才 .close()。

### 1.4 性能 (Performance) — 评分: 8/10

**优点**:
- **Watcher**: debounce 合并多次变更为一次索引，有效减少 I/O。`awaitWriteFinish` 的 `stabilityThreshold: 200` 防止文件写入过程中触发索引。
- **MdGraph Facade**: 惰性初始化模式，子系统在首次调用时才初始化。
- **TemplateEngine**: 正则编译在 V8 中自动缓存，单次渲染性能足够。
- **CLI**: JSON-only 输出，避免格式化开销。

**潜在问题**:
1. (R-05) `mcp-server.ts:324-353` — STDIO 传输层使用逐行读取 + JSON.parse。每次收到数据都重新解析 buffer，在大量并发请求时可能成为瓶颈。但 MCP 协议的典型使用场景（AI Agent 调用）请求频率很低，不影响实际使用。
2. (R-06) `cli.ts:179-201` — `runCli` 函数使用 `process.stdout.write` 的重写实现 stdout 捕获，会同时阻止实际输出。如果用户需要在测试时看到实时输出，这一设计不满足。

---

## 第二部分: OWASP 安全审查

### 2.1 SQL 注入防护 — 评分: 9/10

所有数据库操作经过 MdGraph Facade 和底层 SqliteDbAdapter，均使用 better-sqlite3 参数化查询。新增的 `mcp-server.ts` 和 `cli.ts` 不直接操作数据库，安全。

### 2.2 路径遍历防护 — 评分: 9/10

`filestore.ts:115-124` 已实现路径遍历防护（此前 CR-01 已修复）。MdGraph Facade 使用 `path.resolve` 确保路径规范化，`FileStore` 的 `resolvePath` 方法验证解析后的路径仍在 rootPath 范围内。

### 2.3 MCP 输入验证 — 评分: 7/10

**分析**: MCP Server 接收 JSON-RPC 请求，对用户输入进行验证:
- `md_search`: 验证 `query` 参数存在（`if (!query) throw new Error`）
- `md_navigate`: 验证 `nodeId` 和 `direction` 参数存在
- 缺少参数时返回 -32602 (Invalid params) 错误码

**问题**:
1. (R-07) `mcp-server.ts:250-254` — `callSearch` 对 `args.query` 没有做字符串类型验证。如果 `params.arguments.query` 传入非字符串类型（如数字、对象），`if (!query)` 检查可能通过但后续作为字符串使用时报错。建议添加 `typeof query === 'string'` 检查。
2. (R-08) `mcp-server.ts:279-283` — `callNavigate` 同样缺少 `typeof nodeId === 'number'` 的类型断言。

### 2.4 文件系统操作安全 — 评分: 8/10

**分析**: Watcher 使用的 chokidar 通过 `watch(this.rootPath, { ignored: /(^|[/\\])\.(?!md$)/ })` 过滤文件。但 `ignored` 模式排除了所有隐藏目录中的非 .md 文件，不包括隐藏目录中的 .md 文件。如果 .md 文件位于 `.hidden/` 目录下，watcher 仍会监控它。

### 2.5 错误信息泄露防护 — 评分: 8/10

- CLI 输出标准错误到 stderr，不会混淆 JSON 输出。
- MCP Server 返回错误信息时，使用 `err.message` 而非完整堆栈。
- 错误信息中不包含敏感路径或配置信息。

---

## 第三部分: 架构合规性审查

对照 ADR 决策和接口合约：

| ADR/合约 | 条款 | 状态 | 说明 |
|----------|------|------|------|
| ADR-001 | ESM 模块 | ✅ | 所有文件使用 `import/export` + `.js` 扩展名 |
| ADR-002 | TypeScript strict | ✅ | tsconfig strict: true |
| ADR-003 | `better-sqlite3` DB | ✅ | SqliteDbAdapter 封装 |
| ADR-004 | FTS5 全文搜索 | ✅ | Searcher 使用 FTS5 |
| ADR-005 | BFS 递归 CTE | ✅ | Traverser 实现 |
| ADR-006 | Facade 模式 | ✅ | MdGraph 连接全部子系统 |
| ADR-007 | JSON-only CLI | ✅ | 所有 handler 返回 JSON 对象 |
| ADR-008 | MCP 协议 | ✅ | JSON-RPC 2.0 实现 |
| ADR-009 | chokidar 监控 | ✅ | Watcher 实现 |
| ADR-010 | 增量索引 | ✅ | Indexer 支持 |

### 静默失败检测

| 位置 | 类型 | 风险 | 评估 |
|------|------|------|------|
| watcher.ts:150 | try-catch 静默 | Low | flushing 失败不阻塞监控，可接受 |
| md-graph.ts:116 | try-catch 静默 | Low | 索引失败不影响状态查询，可接受 |
| mcp-server.ts:349-352 | catch 静默 | Low | 无法解析的 JSON 行被忽略，可接受 |
| cli.ts:117 | try-catch 输出错误 | None | 错误正确输出到 stderr |

---

## 第四部分: T-018 README 审查

| 检查项 | 结果 |
|--------|------|
| 技术描述准确 | ✅ CLI 命令、MCP 工具参数与实现一致 |
| 架构图清晰 | ✅ ASCII 架构图正确反映模块分层 |
| 无过时信息 | ✅ 版本号、命令、参数与 package.json 一致 |
| 格式正确 | ✅ Markdown 格式正确，可渲染 |

## 第五部分: T-019 集成测试审查

| 检查项 | 结果 |
|--------|------|
| S1 变更感知 | ✅ 验证 status 的正确性和变更检测 |
| S2 精确搜索 | ✅ 6 个测试覆盖正常、边界、排序场景 |
| S3 文档导航 | ✅ 5 个测试覆盖三方向 + 不存在节点 |
| S4 大文件处理 | ✅ 1000 行文件 + 10 个小文件混合 |
| S5 并发安全 | ✅ 并发搜索/混合操作/幂等性 |
| S6 CLI 命令 | ✅ 6 个测试覆盖全部命令和错误路径 |
| 测试独立性 | ✅ 每个 suite 使用独立临时目录 |
| 清理正确 | ✅ after 中调用 cleanupDir 带重试 |

---

## 审查结论

| 类别 | 评分 | 说明 |
|------|------|------|
| Karpathy 简洁性 | 8.5/10 | 模块职责单一，Monkey-patch CLI 测试待改进 |
| Karpathy 正确性 | 9/10 | 逻辑正确，封装略有打破（测试中 as any 访问私有方法） |
| Karpathy 一致性 | 9/10 | 风格高度统一，命名规范 |
| Karpathy 性能 | 8/10 | 惰性初始化 + debounce 合理，STDIO 层可优化 |
| SQL 注入防护 | 9/10 | 全部参数化查询 |
| 路径遍历防护 | 9/10 | FileStore resolvePath 已验证 |
| MCP 输入验证 | 7/10 | 缺少类型断言，参数验证需增强 |
| 文件系统安全 | 8/10 | chokidar ignored 模式有微小覆盖缺口 |
| 错误信息泄露 | 8/10 | 良好，不暴露堆栈 |
| **综合** | **8.5/10** | 代码质量上乘，架构合规，无严重问题 |

## 待处理问题

| # | 问题 | 严重程度 | 文件 | 建议修复 |
|---|------|---------|------|---------|
| R-01 | runCli 使用 monkey-patch | P3 建议 | cli.ts:179-201 | 将 stdout 作为参数注入 hander |
| R-02 | stdioServer 无错误恢复 | P3 建议 | mcp-server.ts:318-358 | 添加行暂存和重试 |
| R-03 | 私有方法在测试中 as any 访问 | P3 建议 | watcher.test.ts | 改为 public 或 @visibleForTesting |
| R-04 | handleInitialize 参数无 readonly | P3 建议 | mcp-server.ts | 添加 readonly |
| R-05 | STDIO 逐行 JSON 解析效率 | P3 建议 | mcp-server.ts | 使用流式 JSON parser |
| R-06 | runCli 无实时输出 | P3 建议 | cli.ts | 添加 verbose 模式 |
| R-07 | callSearch 参数类型无校验 | P2 一般 | mcp-server.ts:250 | 添加 typeof 检查 |
| R-08 | callNavigate nodeId 类型无校验 | P2 一般 | mcp-server.ts:279 | 添加 typeof === 'number' 检查 |
