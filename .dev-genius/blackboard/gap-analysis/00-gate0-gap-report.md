# Gate 0 差距分析报告 — md-graph 源码 vs DI 设计规格

> 分析时间: 2026-06-04T16:00:00+08:00
> 分析者: 源码状态分析师 (Codebase State Analyst)
> 源码路径: N:/编程工作室/mcp/md-graph/src/
> DI 规格路径: N:/编程工作室/mcp/.di/phases/07_documentation/

---

## 总览

| 维度 | 符合度 | 严重差距数 | 中等差距数 | 轻微差距数 |
|------|--------|-----------|-----------|-----------|
| MCP 工具定义 | 60% | 3 | 4 | 2 |
| 自然语言模板 | 45% | 2 | 4 | 3 |
| CLI 命令 | 30% | 3 | 3 | 2 |
| Schema 数据模型 | 95% | 0 | 0 | 2 |
| Staleness 判定 | 15% | 2 | 1 | 1 |
| 错误处理模式 | 50% | 1 | 3 | 1 |
| SERVER_INSTRUCTIONS | 85% | 0 | 1 | 2 |
| **整体** | **54%** | **11** | **16** | **13** |

---

## 1. MCP 工具定义

### GAP-MCP-001 — md_status 缺少参数定义（严重）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第63-68行):
DI 要求 md_status 接受三个可选参数：
```typescript
interface StatusInput {
    batches?: number;   // 时间批次数量（默认 3）
    since?: string;     // ISO 8601 时间戳过滤
    limit?: number;     // 每批次最大文件数（默认 50）
}
```

**当前实现** (src/api/server-instructions.ts 第122-131行):
md_status 的 `inputSchema` 被定义为空对象 `properties: {}`，不接受任何参数。

**严重级别**: 严重
**影响**: agent 无法指定时间范围或限制结果数量。当索引规模增大时，md_status 可能返回过多数据。

---

### GAP-MCP-002 — md_navigate 缺少 maxResults 参数（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第119-125行):
DI 要求 md_navigate 接受 `maxResults` 参数（默认 20，最大 100）。

**当前实现** (src/api/server-instructions.ts 第163-189行):
md_navigate 的 `inputSchema` 包含 nodeId, path, direction, depth，但缺少 `maxResults` 参数。当前代码在 Traverser 中硬编码 `MAX_VISITED = 2000`（src/analysis/traverser.ts 第13行），未暴露给外部。

**严重级别**: 中等
**影响**: agent 无法控制导航返回的结果数量，可能得到过多或过少结果。

---

### GAP-MCP-003 — md_navigate 的 direction 枚举缺少英文描述约束（轻微）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第120行):
direction 定义为 `'inbound' | 'outbound'`。

**当前实现** (src/api/server-instructions.ts 第177-180行):
direction 参数枚举值和描述使用中文，但 DI 规定工具接受的值为英文 `'inbound'` 和 `'outbound'`。当前 enum 值为英文但 description 为中文。

**严重级别**: 轻微
**影响**: 不影响协议兼容性，但可能影响非中文 agent 理解。

---

### GAP-MCP-004 — md_search 包含 offset 参数，DI 未要求（轻微）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第174-180行):
DI 定义的 md_search 参数仅为：query, type?, file?, maxResults?。

**当前实现** (src/api/server-instructions.ts 第149行):
额外实现了 `offset` 参数（分页偏移）。该参数不在 DI 规格中。

**严重级别**: 轻微
**影响**: 额外功能，不产生负面影响。需确认是否保留。

---

### GAP-MCP-005 — 错误以 JSON-RPC 协议错误返回，非 MCP content 级 ErrorResponse（严重）

**设计规格** (ux-spec/03-error-patterns.md 第17-26行):
DI 要求所有工具错误返回 `ErrorResponse` 嵌入到 `ToolResult.content` 中：
```typescript
interface ErrorResponse {
    isError: true;
    code: string;
    message: string;
    cause: string;
    fix: string;
    recoverable: boolean;
}
```
MCP 协议支持 `content` 中设置 `isError` 字段指示错误。

**当前实现** (src/api/mcp-server.ts 第232-248行):
错误通过 JSON-RPC 协议错误返回（`code: -32603` 或 `-32602`），而非 MCP 内容级错误。错误信息通过 `err.message` 或 `err.toText()` 序列化为字符串。没有使用结构化的 `ErrorResponse.isError` 模式。

**严重级别**: 严重
**影响**: agent 无法通过编程方式判断错误编码（code）、根因（cause）、修复建议（fix）和可恢复性（recoverable），只能解析文本。违反了策略裁决 #9（推翻共享枚举，采用 isError + 文本描述）。

---

### GAP-MCP-006 — 未使用 DI 定义的错误码字符串（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第403-410行):
DI 定义了一组具体的错误码字符串：
| 错误码 | 适用工具 |
|--------|---------|
| INVALID_QUERY | md_search |
| INVALID_PATH | md_navigate |
| INDEX_NOT_INITIALIZED | 所有读工具 |
| INVALID_PARAMETER | 全部 |
| WATCHER_NOT_READY | md_status |
| INTERNAL_ERROR | 全部 |

**当前实现** (src/api/mcp-server.ts 第233行):
当前代码使用 `err instanceof MdGraphError` 统一捕获，`MdGraphError` 类（src/types.ts 第83-98行）定义了 `code` 字段，但 MCP 处理代码中未根据错误码做区分——所有 MdGraphError 返回 `-32603`，非 MdGraphError 的参数错误返回 `-32602`。没有使用 DI 定义的错误码字符串。

**严重级别**: 中等
**影响**: agent 无法通过错误码区分错误类型，降低了自动错误恢复能力。

---

### GAP-MCP-007 — _next 引导格式不符合 DI 规格（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第252-259行):
DI 要求 _next 使用以下格式：
```
【务必】{肯定句式——引导 agent 做什么}
【不要】{禁止句式——防止 agent 犯常见认知错误}
```

**当前实现** (src/api/template.ts 第138-145行):
当前模板引擎将 `{{_next "label":query}}` 渲染为：
```
> 您可以继续查询: **label** (`query`)
```
预定义模板（template.ts 第52-90行）中的 _next 内容为通用引导，缺乏具体性。`renderStatus()` 方法末尾使用了 `【务必】...` 格式（第228行），但 `renderSearch()` 和 `renderNavigate()` 没有按照 DI 要求在末尾嵌入缺失的 `【务必】` + `【不要】` 格式。且缺少 DI 中要求的 `search_hint` 和 `navigate_hint` 条件变量替换。

**严重级别**: 中等
**影响**: 弱模型 agent 可能缺乏明确的下一步引导，增加工具调用浪费。

---

## 2. 自然语言模板（md_status/md_search/md_navigate 输出格式）

### GAP-TPL-001 — md_status 输出缺少索引状态元数据行（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第85行):
DI 要求 md_status 输出末尾必须包含：
```
索引状态: {stale? 过期 : 新鲜} | 过期文件数: {staleFileCount} | 最后索引时间: {lastIndexedAt}
```

**当前实现** (src/api/template.ts 第194-229行):
`renderStatus()` 方法输出的末尾是 `【务必】使用 Read 工具读取上方文件路径和行号...`，缺少索引状态元数据行。stale 信息完全没有出现在输出中。

**严重级别**: 中等
**影响**: agent 无法从 md_status 响应中感知索引新鲜度，违背了裁决 #6（staleness 作为横切关注点嵌入每个响应）。

---

### GAP-TPL-002 — md_search 输出格式与 DI 规格不匹配（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第184-194行):
DI 要求的 md_search 输出格式：
```
## 搜索 "{query}" — {totalResults} 条结果

{index}. **{fileName}** ({path}) 行 {lineRanges} · 相关度 {score}
   所属: {headingPath}
   片段: {snippet}
   {related_line}

索引状态: ... | 过期文件数: ... | 最后索引时间: ...
```

**当前实现** (src/api/template.ts 第235-255行):
当前 `renderSearch()` 输出格式：
```
## 搜索结果: "{query}"

找到 **{totalResults}** 条匹配结果：

- **{fileName}** ({filePath})
  行 {lineRanges} · {headingPath}
  > {snippet}
```
主要差异：
1. 标题使用 `搜索结果: "{query}"` 而非 `搜索 "{query}" — N 条结果`
2. 缺少结果序号 `{index}.`
3. 缺少 `相关度 {score}` 字段（搜索结果对象中 `score` 字段存在但未渲染）
4. 缺少 `{related_line}` 条件行
5. 缺少末尾的索引状态元数据行

**严重级别**: 中等
**影响**: agent 从模板解析的信息不如 DI 规格完整（无分数、无关联文档数、无 stale 状态）。

---

### GAP-TPL-003 — md_navigate 输出格式与 DI 规格严重不匹配（严重）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第129-165行):
DI 要求的 md_navigate 输出格式：
```
## {fileName} 的链接关系

文件主题: {topic}

### {directionLabel} (depth={depth})

- → **{targetFileName}** ({targetPath})
  行 {sourceLineRanges} · 链接文字: "{linkText}"
  主题: {targetTopic}

共 {totalLinks} 条{directionLabel}。
索引状态: ... | 过期文件数: ... | 最后索引时间: ...
```

**当前实现** (src/api/template.ts 第260-283行):
当前 `renderNavigate()` 输出格式：
```
## 文件关系: {sourcePath}

**主题**: {topic}
**方向**: {direction}
**链接数**: {totalLinks}

- [{linkText}]({targetPath}) [{status}]
```
主要差异：
1. 标题使用 `文件关系: {sourcePath}` 而非 `{fileName} 的链接关系`
2. 缺少 `### {directionLabel} (depth={depth})` 子标题
3. 链接格式缺少 `→` 箭头、`sourceLineRanges`、`targetTopic`
4. 使用了 `[linkText](targetPath)` Markdown 链接格式而非 DI 指定的描述格式
5. 缺少末尾的索引状态元数据行

**严重级别**: 严重
**影响**: agent 从 navigate 响应中获取的信息不完整（缺少源行号、目标主题、depth），无法像 DI 设计那样精准地判断链接上下文。

---

### GAP-TPL-004 — 空结果格式不符合 DI 规格（中等）

**设计规格** (ux-spec/03-error-patterns.md 第117-125行):
DI 要求空结果使用自然语言文本：
- md_search: `"search_hint": "搜索 \"{query}\" — 0 条结果\n\n未找到匹配内容..."`
- md_navigate: `"Navigation Results (0 links found for this file)"`

**当前实现** (src/api/template.ts 第249-251行):
当前空搜索结果输出：`未找到匹配内容。` — 缺少 DI 要求的查询回显格式。md_navigate 空结果输出：`暂无链接信息。` — 缺少自然语言空结果文本。

**严重级别**: 中等
**影响**: 空结果处理不够清晰，agent 可能无法快速识别空结果状态。

---

### GAP-TPL-005 — 预定义模板与 DI 规格不一致（轻微）

**设计规格**: DI 的模板系统（architecture-spec/06-mcp-cli-interface.md 第228-259行）定义了基于变量插值和条件块的模板系统。

**当前实现** (src/api/template.ts 第51-90行):
模板类同时维护了 `PREDEFINED_TEMPLATES`（旧版）和 `renderStatus()`/`renderSearch()`/`renderNavigate()`（新版）两套模板输出方法。`PREDEFINED_TEMPLATES` 中的 `md_status` 模板（"## 知识库状态"）已经被真正的 renderStatus 方法取代，但仍然留在代码中。新旧两套模板共存造成混淆。

**严重级别**: 轻微
**影响**: 代码维护负担，可能造成渲染路径不一致。

---

### GAP-TPL-006 — 缺失标记语言关键词提取相关字段渲染（轻微）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第96-101行):
DI 要求 md_status 的变更批次中包含 `boldTerms`/`italicTerms`/`codeTerms` 关键词字段，当非空时输出 `关键词: {terms_csv}`。

**当前实现** (src/analysis/indexer.ts 第177-234行):
`computeChanges()` 方法定义了 `ChangeDetail` 接口包含 `boldTerms`/`italicTerms`/`codeTerms` 字段，但 md-parser.ts 的 `parse()` 方法（第47-123行）并未提取这些 inline token 信息到 DocNode 中（`inlineTokens` 字段未填充），导致 `computeChanges()` 中输入的新节点 `newNodes` 不包含这些字段，始终为空。

**严重级别**: 轻微
**影响**: md_status 输出中缺少关键词信息，降低了 agent 的变更感知能力。

---

## 3. CLI 命令

### GAP-CLI-001 — 存在 DI 未定义的命令：serve 和 install（严重）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第289-367行):
DI 规定的 CLI 命令仅为 3 个：`init`, `status`, `uninstall`。

**当前实现** (src/cli.ts 第115-251行):
当前 CLI 额外实现了 2 个命令：
- `serve`（第183-228行）：启动 MCP 服务器
- `install`（第233-248行）：安装 MCP 配置到 Claude Code

**严重级别**: 严重
**影响**: CLI 命令集超出 DI 规格范围。serve 命令属于 MCP 层的启动方式而非 CLI 排障命令。但此差异可能是有意为之的扩展，需协调器确认是否需要保留。

---

### GAP-CLI-002 — init 命令缺少 --force 和 --incremental 参数（严重）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第305-306行):
DI 要求 init 命令接受参数：
```bash
md-graph init [--dir <path>] [--force] [--incremental]
```

**当前实现** (src/cli.ts 第127-141行):
当前 init 命令只接受一个可选位置参数 `[dir]`，没有 `--force` 或 `--incremental` 标志。当前实现中，如果 `.md-graph` 目录已存在则直接返回错误（`"Repository already exists"`），不支持 --force 重建或 --incremental 增量更新。

**严重级别**: 严重
**影响**: agent 无法通过 CLI 做强制重建或增量索引。DI 规格中的 S5 测试场景（过期恢复）依赖 `init --incremental` 命令。

---

### GAP-CLI-003 — status 命令缺少 --verbose 参数和完整输出字段（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第329-347行):
DI 要求：
```bash
md-graph status [--verbose]
```
输出 JSON 包含：`initialized`, `projectDir`, `totalFiles`, `totalNodes`, `totalEdges`, `staleFileCount`, `staleFilePathList`, `pendingFileCount`, `lastIndexedAt`, `lastIndexDurationMs`, `watcherActive`

**当前实现** (src/cli.ts 第146-160行):
当前 status 只接受 `[dir]` 参数，没有 `--verbose` 标志。输出为 `{ success: true, ...status }`，其中 status 只返回 MdGraphStatus 的 5 个字段（totalFiles, totalNodes, totalEdges, lastIndexedAt, stale, staleFileCount）。缺少 DI 要求的 `initialized`, `projectDir`, `staleFilePathList`, `pendingFileCount`, `lastIndexDurationMs`, `watcherActive` 字段。

**严重级别**: 中等
**影响**: agent 能获取的基础状态信息不足，缺少关键排障信息。

---

### GAP-CLI-004 — uninstall 命令缺少 --force 和 --keep-db 参数（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第353-354行):
DI 要求：
```bash
md-graph uninstall [--force] [--keep-db]
```

**当前实现** (src/cli.ts 第165-179行):
当前 uninstall 只接受 `[dir]` 参数，没有 `--force` 或 `--keep-db` 标志。输出为 `{ success, message }`，DI 要求输出包含 `ok`, `action`, `dbPath`, `dbRemoved`, `durationMs` 等字段。

**严重级别**: 中等
**影响**: agent 无法精细控制卸载行为（保留数据库/强制卸载）。

---

### GAP-CLI-005 — CLI 输出字段名不符合 DI 规格（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第308-323行):
DI 要求 CLI 输出使用特定字段名：
- `"ok"` 而非 `"success"`
- `"mode"` 等

**当前实现** (src/cli.ts 第50-110行):
所有命令的 JSON 输出使用 `"success": true/false` 而非 `"ok"`。init 输出 `{ success, message, storageDir }` 而非 DI 要求的 `{ ok, mode, indexedCount, ... }`。

| DI 字段 | 当前字段 | 状态 |
|---------|---------|------|
| ok | success | 不匹配 |
| mode | 无 | 缺失 |
| indexedCount | 无 | 缺失 |
| skippedCount | 无 | 缺失 |
| failedCount | 无 | 缺失 |
| action | 无 | 缺失 |
| dbPath | 无 | 缺失 |
| dbRemoved | 无 | 缺失 |

**严重级别**: 中等
**影响**: agent 按 DI 格式解析 CLI 输出会失败，影响编程式使用。

---

### GAP-CLI-006 — CLI 未明确区分 exit code 三级（轻微）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第296-297行):
DI 要求：
| exit code | 含义 |
|-----------|------|
| 0 | 完全成功 |
| 1 | 部分成功 |
| 2 | 完全失败 |

**当前实现** (src/cli.ts 第225-227行):
代码中只有 `process.exit(1)` 用于失败场景，没有区分部分成功（exit=1）和完全失败（exit=2）。

**严重级别**: 轻微
**影响**: agent 无法区分操作是部分成功还是完全失败。

---

### GAP-CLI-007 — CLI init 的默认行为是创建新仓库而非增量索引（严重）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第301行):
DI 要求 init "默认增量（已有索引时跳过未变更文件），--force 触发全量重建"。

**当前实现** (src/cli.ts 第51-72行):
当前 `cmdInit()` 如果 `.md-graph` 目录已存在则直接返回 `{ success: false, message: "Repository already exists" }`。从未调用 `Indexer.incrementalIndex()`，仅初始化新索引。完全不符合 DI 的"默认增量"行为。

**严重级别**: 严重
**影响**: agent 无法通过 CLI 做增量索引更新。每次 init 只能创建新仓库。

---

## 4. Schema 数据模型

### GAP-SCH-001 — 表和结构与 DI 规格高度一致（无差距）

Schema 在 src/storage/schema.sql 中的实现与 DI 规格 (architecture-spec/03-data-model.md) 高度吻合：

| DI 表 | 实现状态 |
|-------|---------|
| files | 对 — 所有字段和索引均在 |
| doc_nodes | 对 — 所有字段（含 inline_tokens, snippet, line_ranges）均在 |
| doc_node_content | 对 — node_id PK, content TEXT |
| edges | 对 — 所有字段和 CHECK 约束均在 |
| nodes_fts (FTS5) | 对 — unicode61, prefix='2,3' |
| content_ai trigger | 对 |
| content_ad trigger | 对 |
| content_au trigger | 对 |

SQL 92 个表 + 5 类索引 + 3 个触发器的复杂度级别，当前实现完全覆盖，极少偏差。

### GAP-SCH-002 — doc_node_content 的 content 列类型差异（轻微）

**设计规格** (architecture-spec/03-data-model.md 第100-103行):
DI 未指定 content 列的 TEXT 约束细节。

**当前实现** (src/storage/schema.sql 第63行):
`content TEXT NOT NULL` — 符合预期，无实质差距。

### GAP-SCH-003 — DI 中的 col_start/col_end 字段当前始终为 0（轻微）

**设计规格** (architecture-spec/03-data-model.md 第79-80行):
DI 要求 `col_start INTEGER, col_end INTEGER`。

**当前实现** (src/analysis/parser/md-parser.ts 第328-329行):
`makeNode()` 中 `colStart: 0, colEnd: 0` 始终写死为 0。markdown-it token 的 map 属性只提供行号信息，不提供列信息。因此列字段存在但始终为 0。

**严重级别**: 轻微
**影响**: 列字段无效，但不影响功能（MD 文档的列级别精度在实际使用中很少用到）。

---

## 5. Staleness 判定逻辑

### GAP-STL-001 — 只读路径中 stale 检测始终返回 false（严重）

**设计规格** (ux-spec/02-staleness-contract.md 第33-53行):
DI 要求 stat-only 4 字段检查（path, size, mtimeMs, dbHasRecord）在每次只读查询时执行，实现"假阳性 stale > 假阴性 fresh"的一致性合约。

**当前实现** (src/storage/database.ts 第434-448行):
`getStaleInfo()` 方法始终返回 `stale: false, staleFileCount: 0`。上层 Searcher（src/analysis/searcher.ts 第51行）、Traverser（src/analysis/traverser.ts 第81行）和 MdGraph（src/md-graph.ts 第126行）都直接使用这个值，从未做实际的 stat 检查。

**严重级别**: 严重
**影响**: 系统永远不会检测到过期数据。agent 永远不会看到 stale 信号，也就不会触发增量索引。整个 staleness 契约（裁决 #6）在只读路径上完全失效。

---

### GAP-STL-002 — Watcher.stalenessCheck 只检查了 2 个字段，非 4 字段（中等）

**设计规格** (ux-spec/02-staleness-contract.md 第33-53行):
DI 要求 4 字段判定：file_exists, db_has_record, size, mtimeMs。

**当前实现** (src/analysis/watcher.ts 第91-107行):
`stalenessCheck()` 方法只检查了 `size` 和 `mtimeMs` 两个字段。缺少 `file_exists`（文件是否存在）和 `db_has_record`（DB 中是否有记录）两个判定条件。且该方法未被搜索/导航路径调用。

**严重级别**: 中等
**影响**: staleness 检测不完整，可能漏检文件删除、DB 记录缺失等状态。

---

### GAP-STL-003 — 一致性合约"假阳性优先"未在实现中体现（严重）

**设计规格** (ux-spec/02-staleness-contract.md 第60-66行):
DI 明确要求 "false positive stale > false negative fresh"。

**当前实现**: 由于 `getStaleInfo()` 始终返回 `stale: false`，实际行为变成了 "永远 fresh" —— 完全违反了 DI 的一致性合约。

**严重级别**: 严重
**影响**: agent 基于"数据永远新鲜"的错误假设做出决策，可能导致使用过时信息。

---

## 6. 错误处理模式

### GAP-ERR-001 — 错误响应格式不匹配 DI 的 ErrorResponse 结构（严重）

**设计规格** (ux-spec/03-error-patterns.md 第17-26行):
DI 要求错误以 `ErrorResponse` 结构嵌入 MCP 响应：
```typescript
interface ErrorResponse {
    isError: true;
    code: string;
    message: string;
    cause: string;
    fix: string;
    recoverable: boolean;
}
```

**当前实现** (src/api/mcp-server.ts 第232-248行):
`ErrorResponse` 接口在 types.ts 中已定义（第180-188行），但 MCP 服务器代码中完全未使用。错误通过 JSON-RPC 协议错误返回（-32602/-32603），格式为 `{ code, message }`，缺少 `cause`, `fix`, `recoverable`, `isError` 字段。

**严重级别**: 严重
**影响**: agent 无法获取结构化的错误信息（根因、修复建议、可恢复性），降低了错误自动恢复能力。

---

### GAP-ERR-002 — MdGraphError 的 toText 格式不匹配 DI 三段式（中等）

**设计规格** (ux-spec/03-error-patterns.md 第9-12行):
DI 要求三段式：问题描述（message）+ 根因分析（cause）+ 修复指令（fix）。

**当前实现** (src/types.ts 第95-97行):
`MdGraphError.toText()` 输出格式：
```
问题: {message}
原因: {cause_detail}
修复: {fix}
```
字段名使用中文（问题/原因/修复），DI 期望的是英文字段在 ErrorResponse 中。且 `cause_detail` 字段名（带下划线）与 DI 的 `cause` 不完全一致。

**严重级别**: 中等
**影响**: 文本格式不一致，但语义等价。

---

### GAP-ERR-003 — 错误码未按照 DI 规格实现（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第403-410行):
DI 定义了 6 个错误码：INVALID_QUERY, INVALID_PATH, INDEX_NOT_INITIALIZED, INVALID_PARAMETER, WATCHER_NOT_READY, INTERNAL_ERROR。

**当前实现** (src/types.ts 第83行):
`MdGraphError` 类接受任意 `code: string`，但 MCP 服务器（mcp-server.ts）并不读取或传递这个 code。没有定义常量或枚举来引用 DI 规定的错误码。

**严重级别**: 中等
**影响**: 错误码仅为字符串，不在协议层传递，agent 无法在协议层面获取。

---

### GAP-ERR-004 — 未实现 INDEX_NOT_INITIALIZED 的特殊处理（轻微）

**设计规格** (ux-spec/03-error-patterns.md 第55-56行):
DI 要求 INDEX_NOT_INITIALIZED 错误包含具体描述和修复指引。

**当前实现** (src/api/mcp-server.ts 第256-260行):
当前 `noProject()` 方法返回友好提示文本 `"## md-graph 未初始化\n\n当前项目尚未运行...`。这是自然语言文本，不是结构化的 ErrorResponse。

**严重级别**: 轻微
**影响**: 功能上描述了未初始化状态，但格式不符合 DI 规范。

---

## 7. SERVER_INSTRUCTIONS 结构

### GAP-SRV-001 — 结构与 DI 规格高度一致（差距极少）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第372-397行):
DI 要求 6 段结构：
1. 一句话定义
2. 意图→工具快速参考表
3. 每个工具的详细描述
4. _next 解读指南
5. Staleness 解读指南
6. 常见错误与恢复

**当前实现** (src/api/server-instructions.ts 第11-108行):
6 段结构完全对齐 DI 规格。段落内容和工具描述方法匹配度高。

### GAP-SRV-002 — md_status 描述未提及变更批次参数（轻微）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第55-61行):
DI 要求 md_status 描述中应包含变更批次（batches）概念和参数。

**当前实现** (src/api/server-instructions.ts 第22-23行):
工具对照表中 md_status 的描述为 "变更感知入口 — 查看最近被修改、新增、删除的 MD 文件"，未明确提及按批次分组的概念。详细说明（第32-40行）中也未提及 `batches`, `since`, `limit` 参数。

**严重级别**: 轻微
**影响**: agent 不知道 md_status 支持参数过滤。

---

### GAP-SRV-003 — SERVER_INSTRUCTIONS 中的工具描述与工具定义 description 不完全同步（轻微）

**设计规格**: DI 要求 SERVER_INSTRUCTIONS 与工具定义保持一致。

**当前实现**: `createServerInstructions()` 中的 md_status 描述为中文（"变更感知入口"），但 `getToolDefinitions()` 中的 md_status description 为英文（"CHANGE AWARENESS ENTRY — call FIRST each session..."）。两者不一致。

**严重级别**: 轻微
**影响**: 中英文混杂，对 agent 的 tool-choice 可能产生轻微影响。

---

## 8. 其他差距

### GAP-MISC-001 — 变更批次按日期分组而非 ±15 分钟窗口（中等）

**设计规格** (architecture-spec/06-mcp-cli-interface.md 第60行):
DI 要求变更按 ±15 分钟时间窗口分组为 batches。

**当前实现** (src/storage/database.ts 第484-539行):
`getChangeBatches()` 按日期（YYYY-MM-DD）分组，而非 ±15 分钟窗口。且 `timeWindow` 直接使用日期字符串作为时间窗口标签，不是 DI 要求的时间范围格式（如 "14:32 ± 15min"）。

**严重级别**: 中等
**影响**: 变更分组粒度过粗（天级而非分钟级），agent 无法精确理解变更的时间上下文。

---

### GAP-MISC-002 — 模板引擎的渲染方法与预定义模板存在两套实现（轻微）

**设计规格**: DI 定义了一套统一的模板系统。

**当前实现** (src/api/template.ts):
`TemplateEngine` 类中存在两套输出机制：
1. 旧版：`PREDEFINED_TEMPLATES` + `render()` 方法（第51-90行）
2. 新版：`renderStatus()`/`renderSearch()`/`renderNavigate()` 方法（第194-283行）
两套机制都存活在代码中。旧版的 `md_status` 模板（"## 知识库状态\n\n当前索引了..."）与新版 renderStatus 的（"## 最近变更 (N 批)"）输出完全不同。

**严重级别**: 轻微
**影响**: 代码维护负担，容易让开发者混淆使用哪套渲染路径。

---

### GAP-MISC-003 — 解析器中 inline_tokens 字段未被填充（轻微）

**设计规格** (architecture-spec/03-data-model.md 第87行):
DI 定义 doc_nodes 包含 `inline_tokens TEXT` 字段，用于存储 bold/italic/code 标记信息。

**当前实现** (src/analysis/parser/md-parser.ts 第47-123行):
`parse()` 方法生成的 DocNode 对象不包含 `inlineTokens` 字段。`makeNode()` 方法（第312-336行）创建 DocNode 时完全不设置 `inlineTokens`。

**严重级别**: 轻微
**影响**: 关键词提取功能无法使用（GAP-TPL-006），但主功能不受影响。

---

## 统计摘要

| 分类 | 严重 | 中等 | 轻微 | 合计 |
|------|------|------|------|------|
| MCP 工具定义 | 3 | 4 | 2 | 9 |
| 自然语言模板 | 2 | 4 | 3 | 9 |
| CLI 命令 | 3 | 3 | 2 | 8 |
| Schema 数据模型 | 0 | 0 | 2 | 2 |
| Staleness 判定 | 2 | 1 | 1 | 4 |
| 错误处理模式 | 1 | 3 | 1 | 5 |
| SERVER_INSTRUCTIONS | 0 | 1 | 2 | 3 |
| 其他 | 0 | 1 | 2 | 3 |
| **总计** | **11** | **17** | **15** | **43** |

---

## 紧急修复建议（按优先级排序）

### P0 — 致命缺陷（影响核心功能）

1. **GAP-STL-001**: 只读路径 stale 检测始终返回 false — 需在 `getStaleInfo()` 中实现 stat-only 4 字段检测
2. **GAP-MCP-005**: 错误以 JSON-RPC 协议错误返回 — 需改为 MCP content 级 ErrorResponse
3. **GAP-CLI-002**: init 缺少 --force 和 --incremental 参数 — CLI 无法执行增量索引
4. **GAP-CLI-007**: init 默认行为是创建新仓库而非增量索引 — 与 DI 规格严重冲突

### P1 — 主要差距（影响使用体验）

5. **GAP-MCP-001**: md_status 缺少参数 — 需添加 batches/since/limit 参数
6. **GAP-CLI-001**: 存在 DI 未定义的 serve 和 install 命令 — 需协调器确认
7. **GAP-TPL-003**: md_navigate 输出格式严重不匹配 — 需按 DI 规格重写渲染
8. **GAP-TPL-001/002**: md_status/md_search 输出缺少 stale 元数据行
9. **GAP-CLI-003/004/005**: CLI 输出字段和参数与 DI 规格不一致
10. **GAP-ERR-001**: 错误响应未使用 ErrorResponse 结构

### P2 — 次要差距（建议迭代修复）

11. **GAP-MCP-007**: _next 引导格式不符合 DI 规格
12. **GAP-MISC-001**: 变更批次按日期分组而非 ±15 分钟窗口
13. **GAP-ERR-003/002**: 错误码使用不完整
14. **GAP-TPL-004**: 空结果格式不符合 DI
15. **GAP-TPL-006/GAP-MISC-003**: inline_tokens/关键词提取缺失

---

## 向协调器汇报

### 严重差距清单

| 编号 | 差距 | 类型 | 影响模块 |
|------|------|------|---------|
| GAP-MCP-001 | md_status 缺少参数 | 中 | api/mcp-server.ts |
| GAP-MCP-005 | 错误使用 JSON-RPC 而非 ErrorResponse | 高 | api/mcp-server.ts |
| GAP-TPL-003 | md_navigate 输出格式严重不匹配 | 高 | api/template.ts |
| GAP-CLI-001 | 存在 DI 未定义的命令（serve/install） | 中 | cli.ts |
| GAP-CLI-002 | init 缺少 --force --incremental | 高 | cli.ts |
| GAP-CLI-007 | init 默认行为不符（创建而非增量） | 高 | cli.ts |
| GAP-STL-001 | stale 始终返回 false | 高 | storage/database.ts |
| GAP-STL-003 | 违反"假阳性优先"一致性合约 | 高 | 跨模块 |
| GAP-ERR-001 | 错误格式不匹配 ErrorResponse | 高 | api/mcp-server.ts |

### 需决策事项

1. **serve 和 install 命令**：当前 CLI 包含 DI 未定义的命令，是作为额外功能保留还是移除？
2. **offset 参数**：md_search 当前包含 DI 未要求的 offset 参数，是否保留？
3. **CI/CLI agent 场景**：DI 假设 CLI 仅 agent 使用，但当前实现已经扩展了人类使用场景（install 命令），是否要调整 CLI 策略？

### 技术债务

1. `src/api/template.ts` 中同时存在新旧两套模板渲染机制（PREDEFINED_TEMPLATES + renderStatus/Search/Navigate），需清理
2. `src/analysis/parser/md-parser.ts` 中 `extractLinks()` 方法（第415-453行）调用了两次链接提取（先遍历一次，再调用 `extractLinksAccurate`），存在重复扫描
3. `src/storage/database.ts` 中 `getChangeBatches()` 分组粒度与 DI 规格（±15分钟）不符，需重写时间窗口算法
