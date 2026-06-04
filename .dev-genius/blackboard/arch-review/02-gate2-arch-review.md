# Gate 2 架构审核报告

> 审核者: dev-genius-architect
> 审核时间: 2026-06-04T18:00:00+08:00
> 上游: task-queue/01-gate1-task-queue.md + gap-analysis/00-gate0-gap-report.md
> DI 规格: .di/phases/07_documentation/ (gen-3)
> 策略裁决: .di/blackboard/strategy-verdicts/01-final-verdicts.md

---

## 总览

| 项目 | 值 |
|------|-----|
| 总任务数 | 7 |
| 通过 | 3 (Task-4, Task-6, Task-7) |
| 需修改 | 3 (Task-1, Task-3, Task-5) |
| 需拆解/追加 | 1 (Task-2) |
| 待决策事项裁决 | 2 项 (serve/install + offset) |
| 新增架构约束 | 3 项 |
| 需修正任务 | 3 项 |

### 架构复杂度核定

| 任务 | Planner 标注 | 核定 | 说明 |
|------|-------------|------|------|
| Task-1 | 架构签批 | ➡️ 影响评估 | 发现架构层冲突——stale 检测不应在 DB 层做 fs.stat |
| Task-2 | 影响评估 | ➡️ 影响评估 | 需合并 serve/install 裁决结果 |
| Task-3 | 影响评估 | ➡️ 影响评估 | 确认 |
| Task-4 | 影响评估 | ➡️ 影响评估 | 确认 |
| Task-5 | 架构签批 | ➡️ 影响评估 | 涉及 offset 参数去留决策，需评估工具契约变更 |
| Task-6 | 架构签批 | ➡️ 架构签批 | 确认 |
| Task-7 | 架构签批 | ➡️ 架构签批 | 确认 |

---

## 决策事项裁决

### 裁决 A: serve/install 命令去留 (GAP-CLI-001)

**问题**: 当前 CLI 额外实现了 DI 未定义的 `serve` 和 `install` 命令。

**DI 规格证据**:
- 裁决 #7: "CLI — 3 命令（init/status/uninstall），对齐 CodeGraph"
- architecture-spec/06-mcp-cli-interface.md: CLI 只定义了 init/status/uninstall 三个排障命令
- 裁决 #7 边界条件: "如果未来出现'人类开发者直接使用 CLI'的需求，需重新考虑 CLI 命令集"

**分析**:

1. **serve 命令**: MCP 服务器必须通过某种方式启动。在 DI 的架构中，MCP 服务器启动是基础设施层操作，不属于 CLI 排障命令集。但当前代码中 `serve` 是启动 MCP 服务器的唯一入口。问题不在于 serve 本身是否存在，而在于它被归类为 CLI 排障命令。如果完全删除 serve，需要另外创建独立入口点。

2. **install 命令**: 安装 MCP 配置到 Claude Code 的问题。DI 从未定义此命令。用户可以通过 Claude Code 的 `~/.claude/settings.json` 手动配置 MCP 服务器。此外，`main()` 函数中无参数时自动运行安装器的行为不符合"CLI 仅排障"的设计哲学。

**裁决**:
- **serve**: **保留**但重构。从 `cli.ts` 的 Commande r 命令集中分离出去，改为独立入口点。建议:
  1. 保留 `src/mcp-entry.ts` 或 `src/main.ts` 作为 MCP 服务器启动入口
  2. 从 `createCli()` 的命令列表中移除 `serve` 命令，使其不作为 CLI 排障命令暴露
  3. 或者保留 `md-graph serve` 作为向后兼容但不将其列为官方命令 (不在 --help 中展示)
- **install**: **删除**。从 CLI 中移除 `install` 命令。移除 `main()` 函数中无参数自动运行安装器的逻辑。
- **Task-2 变更**: 在 Task-2 中追加删除 install 命令 + 重构 serve 启动方式的工作项

### 裁决 B: md_search 的 offset 参数去留 (GAP-MCP-004)

**问题**: 当前 `md_search` 实现了 DI 未要求的 `offset` 参数。

**DI 规格证据**:
- architecture-spec/06-mcp-cli-interface.md: `SearchInput` 仅定义 `query, type?, file?, maxResults?`
- 裁决 #5: 减少工具数量 = 降低 agent 认知负荷。同理，减少参数 = 降低 agent 认知负荷

**分析**:

1. Agent 场景中"翻页"搜索的使用频率极低——agent 一次性查看 top-K 结果后直接使用 Read 工具读取相关文件，不需要遍历第 2 页。
2. 保留 offset 意味着维护 DI 未定义的参数，增加测试覆盖面开销。
3. 删除 offset 不丢失任何功能，agent 可以通过调整 maxResults 获得更多结果。
4. 当前 `SearchOptions` 接口已同时存在于 `database.ts`(DB 层) 和 `types.ts`(公共 API 层)，两个地方都需清理。

**裁决**:
- **删除 offset 参数**，严格对齐 DI 规格
- **受影响文件**: `src/types.ts` (SearchOptions), `src/storage/database.ts` (SearchOptions), `src/api/server-instructions.ts` (工具定义和描述), `src/api/mcp-server.ts` (参数处理)
- **Task-5 变更**: 追加删除 offset 的工作项

---

## 任务级审核

### Task-1: 实现 Staleness 4 字段 stat-only 检测

**状态**: ❌ 需修改

**审核结论**: 任务实现方案存在架构层问题——将 fs.stat 调用放入 `SqliteDbAdapter.getStaleInfo()` 违反了分层架构原则。

#### 发现的问题

**问题 1: 职责错位** — DB 适配器不应做文件系统操作

`getStaleInfo()` 位于 `src/storage/database.ts:434` 的 `SqliteDbAdapter` 类中。代码注释已明确说明:"SqliteDbAdapter 层无法判断 stale，由上层 Indexer 计算"。DB 适配器的职责是数据库 CRUD, 不应引入 fs.existsSync / fs.statSync 调用。

如果将 fs.stat 放入 `getStaleInfo()`，会导致:
- `SqliteDbAdapter` 不再可测试（依赖真实文件系统）
- 分层抽象被破坏（底层 DB 层依赖文件系统）
- 单元测试需要 mock fs 模块

**问题 2: getStaleInfo() 无文件参数 — 无法做 per-query 检测**

当前 `getStaleInfo()` 签名是 `getStaleInfo(): StaleInfo`，不接受任何文件参数。但 DI 规格要求 per-file staleness 检测:
- md_search: "对每个命中文件做 stat check"
- md_navigate: "链接中任一端节点 stale → link 的 stale 标志设为 true"
- md_status: DB 级聚合

每个调用方需要的文件集不同:
- `searcher.ts:59` 需要只检查搜索结果中的文件
- `traverser.ts:81` 需要只检查导航结果中的文件
- `MdGraph.status():126` 需要检查所有活跃文件

**修正方案**:

1. **新增一个独立的 staleness 检查函数**（不在 DB 适配器中）:
   - 位置: `src/storage/staleness.ts`（新文件）或在 `src/md-graph.ts` 中作为私有方法
   - 签名: `checkFileStaleness(fileRecords: FileInfo[]): StalenessInfo`
   - 实现: 对每个文件执行 stat-only 4 字段检查
   - 引用 DI 规格的 `isStale()` 伪代码作为实现依据

2. **修改调用方式**:
   - `MdGraph.status()`: 从 DB 获取所有活跃文件 → 调用 staleness 检查 → 聚合结果
   - `Searcher.search()`: 对搜索结果中的文件做 staleness 检查 → 返回 per-result stale 标志 + 整体 stale 聚合
   - `Traverser.navigate()`: 对导航结果中的文件做 staleness 检查 → 返回 per-link stale 标志 + 整体 stale 聚合

3. **保留 `getStaleInfo()` 的简化版本**: 继续返回 `stale: true` 保守值（比 fake false 更符合"假阳性优先"合约）或将其降级为仅提供 `lastIndexedAt`。

#### 修改建议

| 文件 | 修改内容 |
|------|---------|
| 新建 `src/storage/staleness.ts` | 实现 `function checkStaleness(files: FileInfo[]): StaleInfo` — stat-only 4 字段检查 |
| `src/md-graph.ts:115-136` | `status()` 中调用新 staleness 函数替代 `this.db.getStaleInfo()` |
| `src/analysis/searcher.ts` | 搜索结果处理后调用 staleness 检查（需注入或通过 MdGraph 间接调用） |
| `src/analysis/traverser.ts` | 导航结果处理后调用 staleness 检查 |
| `src/storage/database.ts:434-448` | `getStaleInfo()` 降级为仅返回 `lastIndexedAt`，stale 和 staleFileCount 由调用方填充 |

> ⚠️ **注意**: 如果只修改 database.ts 而不改动 Searcher/Traverser 的调用方式，staleness 仍不会正确工作。因为 searcher.ts 在第 59 行获取 staleInfo 后就直接返回了，没有将 stale 信息计入 per-result 级别。

---

### Task-2: 重写 CLI 命令匹配 DI 规格

**状态**: ⚠️ 有条件通过（需合并 serve/install 裁决结果）

**审核结论**: 任务设计与 DI 规格对齐度好，但需追加以下工作项。

#### 追加工作项（因裁决 A）

1. **删除 `install` 命令**:
   - 移除 `cli.ts:233-248` 中的 `install` 命令定义
   - 移除 `cli.ts:33-37` 中的 `getRunInstaller()` 延迟导入
   - 移除 `cli.ts:298-303` 中的 `main()` 无参数自动运行安装器的逻辑
   - 可保留 `src/installer/index.ts` 文件（供将来需要时恢复），但从 CLI 入口中移除

2. **重构 `serve` 命令**:
   - 从 `createCli()` 的命令列表中移除 `serve` 命令
   - 作为替代启动方式，按照 MCP 标准实践创建入口文件 `src/mcp-entry.ts`:
     ```typescript
     // src/mcp-entry.ts — MCP 服务器独立入口
     // 启动方式: node src/mcp-entry.js [--path <project-root>]
     ```
   - 或者保留 `md-graph serve` 但标记为隐藏命令（hidden command），不在 --help 或 SERVER_INSTRUCTIONS 中出现

3. **统一命令退出码**:
   - Task-2 已覆盖 exit code 三级区分（0/1/2），确认即可

#### 架构约束追加

需在 Task-2 的验收标准中追加:
- 验证: `md-graph --help` 只显示 init/status/uninstall 三个命令（无 serve/install）
- 验证: `md-graph`（无参数）不自动运行安装器
- 验证: `md-graph uninstall` 在非交互模式下不需要确认（当前已有 `--force` 设计）

---

### Task-3: 实现 ErrorResponse 结构化错误处理

**状态**: ⚠️ 需修改

**审核结论**: 核心方向正确，但有两个架构层面的问题需要修正。

#### 发现的问题

**问题 1: MdGraphError 的字段名与 DI 不匹配**

当前 `src/types.ts:83-98` 的 `MdGraphError`:
```typescript
constructor(
    public code: string,
    message: string,
    public cause_detail: string = '',   // DI 要求 cause（不带下划线）
    public fix: string = '',
    public recoverable: boolean = true
)
```

字段 `cause_detail` 与 DI 的 `ErrorResponse.cause` 不一致。Task-3 的规划中已在 types.ts 修正 toText() 格式，但未提及修改构造函数参数名。

**问题 2: ErrorResponse 接口已定义但未使用**

`src/types.ts:180-187` 已定义 `ErrorResponse` 接口，但 mcp-server.ts 未使用。Task-3 的实现应直接引用该接口，而非重新定义。

**问题 3: 错误恢复流程与 DI 对齐**

DI 的 `ux-spec/03-error-patterns.md` 第 129-145 行定义了 agent 侧的错误恢复流程。Task-3 的 `makeErrorResponse()` 辅助函数应确保返回格式兼容该流程。特别是 `recoverable` 字段的正确使用:
- `INTERNAL_ERROR` 必须设置 `recoverable: false`
- 其他所有错误 `recoverable: true`

#### 修正建议

| 修改点 | 说明 |
|--------|------|
| `MdGraphError` 构造函数参数 `cause_detail` → `cause` | 对齐 DI 字段名，兼容 ErrorResponse 接口 |
| `MdGraphError.toText()` 前缀 `原因` → `原因` 已对 | 确认当前 `toText()` 的三段式格式对齐 DI 要求 |
| `mcp-server.ts` 中的 `makeErrorResponse()` | 直接返回 `ErrorResponse` 类型（复用 types.ts 中已定义的接口） |
| `mcp-server.ts` 中 `handleToolsCall()` 的 catch | 不要将错误格式改为 content-level 后忘记移除 JSON-RPC error 的兜底返回 |

---

### Task-4: 重写自然语言模板输出格式

**状态**: ✅ 通过

**审核结论**: 任务设计完善，与 DI 规格对齐度高。

#### 确认要点

1. **删除 PREDEFINED_TEMPLATES**: 当前代码第 51-90 行的预定义模板确实与新版 render 方法共存，清除方向正确。
2. **renderStatus 格式对齐**: DI 规格的第 72-108 行与任务规划的第 304-317 行完全一致。
3. **renderSearch 格式对齐**: DI 规格的第 184-224 行与任务规划的第 318-330 行完全一致。
4. **renderNavigate 格式对齐**: DI 规格的第 129-165 行与任务规划的第 333-348 行完全一致。
5. **空结果处理**: 裁决 #11（自然语言文本 + 保留结构化字段）已在任务验收标准中体现。
6. **staleness 三字段元数据行**: 每个响应末尾的统一格式已在任务中体现。

#### 建议追加

在 `renderSearch` 和 `renderNavigate` 中，当前模板数据传递方式（通过 `md-graph.ts:renderSearch()` 中的 `results.map()` 只传递部分字段）会丢失 `score`、`sourceLineRanges`、`targetTopic` 等字段。Task-4 需确保:

- `renderSearch()` 接收的 data 对象包含 `score`, `lineRanges`, `headingPath`, `snippet` 等全部 DI 要求字段
- `renderNavigate()` 接收的 data 对象包含 `sourceLineRanges`, `targetTopic`, `targetFileName` 等全部 DI 要求字段
- **受影响文件**: `src/md-graph.ts:204-219` 中 `renderSearch()` 的 results.map 需要传递完整字段

---

### Task-5: 更新 MCP 工具参数定义和描述

**状态**: ⚠️ 需修改（合并 offset 裁决 + 缺 maxResults 的强制执行）

**审核结论**: 除 offset 参数去留外，还有两个遗漏项。

#### 发现的问题

**问题 1: md_navigate 缺少 maxResults 参数的强制执行边界**

Task-5 规划为 md_navigate 添加 `maxResults` 参数，但未提及在 Traverser 层实现上限限制。当前 `traverser.ts` 中硬编码 `MAX_VISITED = 2000`，但 DI 要求 `maxResults` 的默认值为 20，最大 100。

需要在 Traverser 层添加 `maxResults` 参数支持，确保:
- 默认值 20
- 最大值上限 100
- md_navigate 工具定义中的描述与 Traverser 实现一致

**问题 2: server-instructions.ts 中 md_status 工具描述与实际参数分离**

当前 `createServerInstructions()` 中的 md_status 描述（第 28-40 行）没有提及 `batches`、`since`、`limit` 参数。而 `getToolDefinitions()` 中的 md_status 描述（第 125-131 行）已有详细文本。Task-5 需确保两者同步更新。

#### 修正建议

| 修改点 | 文件 | 说明 |
|--------|------|------|
| 删除 offset 参数 | `src/api/server-instructions.ts:146-149` | 移除 offset 的定义和描述 |
| 删除 offset 参数 | `src/types.ts:104` | 从 SearchOptions 中移除 |
| 删除 offset 参数 | `src/storage/database.ts:29` | 从 DB 层 SearchOptions 中移除 |
| 添加 maxResults 到 md_navigate | `src/analysis/traverser.ts` | 参数传递到 Traverser 实现 |
| 同步 SERVER_INSTRUCTIONS | `src/api/server-instructions.ts` | 确保 md_status 描述提及 batches/since/limit |

---

### Task-6: 实现 inline_tokens 关键词提取

**状态**: ✅ 通过

**审核结论**: 任务设计正确，与 DI 规格一致。

#### 确认要点

1. **实现路径正确**: 在 `md-parser.ts` 的 `parse()` 方法中对 inline token 做二次遍历，提取 strong/em/code 类型的 children。
2. **数据结构对齐**: 需要写入 `DocNode.inlineTokens` 字段，格式为 `{ boldTerms: string[], italicTerms: string[], codeTerms: string[] }`。
3. **与 Task-4 的依赖**: Task-4 中的 `{keywords_line}` 条件行依赖于 Task-6 填充的数据。建议 Task-6 在 Task-4 之前或并行完成。
4. **零兼容风险**: 新增字段写入对现有索引无破坏性，旧记录没有 inlineTokens 时渲染为空。

---

### Task-7: 修复变更批次分组为 ±15 分钟窗口

**状态**: ✅ 通过

**审核结论**: 任务设计完善，与 DI 规格完全一致。

#### 确认要点

1. **当前实现**: `database.ts:484-539` 的 `getChangeBatches()` 按日期分组（YYYY-MM-DD）。
2. **目标实现**: 按 ±15 分钟时间窗口分组，使用 ±15min 迭代聚类算法。
3. **时序约束**: 需在 Task-1 之后执行（共用 database.ts 文件，避免合并冲突）。
4. **时间窗口标签**: DI 要求 `"14:32 ± 15min"` 格式，任务验收标准已覆盖。
5. **批处理顺序**: 按时间倒序排列（最新在前），任务验收标准已覆盖。

---

## 新增架构约束

### 约束 1: 职责分离 — Staleness 检查不在 DB 层

**来源**: Task-1 审核发现问题
**规则**: 文件系统 stat 操作（fs.existsSync, fs.statSync）不得放入 `SqliteDbAdapter` 或任何数据库访问层。Staleness 检查应:
- 由调用方（Searcher, Traverser, MdGraph）在获取 DB 数据后执行
- 位于独立的 staleness 检查模块
- 调用方传入待检查的文件记录列表

### 约束 2: 工具契约中对齐 — 无 DI 未定义的参数

**来源**: Task-5 审核 + 裁决 B
**规则**: MCP 工具参数定义必须严格对齐 DI 规格。DI 未定义的参数（如 `offset`）不得出现在工具定义的 `inputSchema` 中。扩展参数必须:
1. 有 ADR 记录决策理由
2. 不影响 DI 定义的核心行为
3. 在 SERVER_INSTRUCTIONS 中说明

### 约束 3: CLI 排障命令集剥离基础设施命令

**来源**: Task-2 审核 + 裁决 A
**规则**: CLI 仅包含 DI 定义的排障命令（init/status/uninstall）。基础设施命令（如 serve/MCP 启动）不应出现在 CLI 命令集或 --help 中。MCP 服务器启动应通过独立入口文件或启动脚本完成，而非 CLI 子命令。

---

## 修改后的任务依赖和优先级

```
阶段 1: P0 并行 (3 个任务)
  ├── Task-1: Staleness 检测       → 需按修正方案调整架构
  ├── Task-2: CLI 命令重写          → 追加删除 install + 重构 serve
  └── Task-3: ErrorResponse         → 修正 MdGraphError 字段名

阶段 2: P1 并行
  ├── Task-4: 模板输出格式          → 通过，按原计划执行
  ├── Task-5: 工具参数定义          → 追加删除 offset + maxResults 强制执行
  └── Task-6: inline_tokens         → 通过，可与 Task-4 并行

阶段 3: P2 串行
  └── Task-7: 变更批次分组          → 在 Task-1 之后执行
```

### 执行建议

1. Task-1 需要在实施前先确认新 staleness 模块的位置和接口设计。建议 Developer 在开始 Task-1 之前先与 Architect 确认架构方案。
2. Task-3 的 `MdGraphError` 字段改名会影响 `toText()` 方法，开发者需注意现有测试的兼容性。
3. Task-5 的 offset 删除涉及多文件变更（types.ts, database.ts, server-instructions.ts, mcp-server.ts），需确保所有文件同步清理。

---

## 引用说明

本报告引用的 DI 规格依据:
- `architecture-spec/06-mcp-cli-interface.md` — MCP 工具定义、CLI 命令规范、输出模板
- `ux-spec/02-staleness-contract.md` — stat-only 4 字段检测、假阳性优先合约
- `ux-spec/03-error-patterns.md` — ErrorResponse 三段式格式、错误码清单
- 裁决 #6 — staleness 横切关注点 + stat-only 检查
- 裁决 #7 — CLI 3 命令（init/status/uninstall）
- 裁决 #9 — isError + 文本描述（推翻共享枚举）
- 裁决 #11 — 空结果自然语言文本
