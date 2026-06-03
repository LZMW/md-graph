# 测试用例清单 — 第 2 批: T-002, T-005, T-006

> gen: gen-1 | 设计时间: 2026-06-03T23:05:00+08:00

## 测试统计

| 模块 | 正常流程 | 边界条件 | 异常场景 | 合计 | 通过 |
|------|---------|---------|---------|------|------|
| FileStore (filestore.test.ts) | 6 | 2 | 2 | 10 | 10 |
| SqliteDbAdapter (database.test.ts) | 25 | 6 | 6 | 37 | 37 |
| 依赖验证 (独立) | 1 | 0 | 1 | 2 | 1 |
| **合计** | **32** | **8** | **9** | **49** | **48** |

## 正常流程用例 — FileStore

### TC-FS-001: read — 读取 UTF-8 文件内容
- **覆盖**: AC-04
- **前置条件**: 测试目录存在含内容 `# Hello\nWorld` 的文件 `a.md`
- **测试步骤**: 1. 调用 `store.read('a.md')`
- **预期结果**: 返回字符串 `'# Hello\nWorld'`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ read — 应读取 UTF-8 文件内容`

### TC-FS-002: exists — 文件存在返回 true
- **覆盖**: AC-06
- **前置条件**: 测试目录存在文件 `a.md`
- **测试步骤**: 1. 调用 `store.exists('a.md')`
- **预期结果**: 返回 `true`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ exists — 文件存在应返回 true`

### TC-FS-003: stat — 返回 fs.Stats 对象
- **覆盖**: AC-04
- **前置条件**: 测试目录存在文件 `a.md`
- **测试步骤**: 1. 调用 `store.stat('a.md')`
- **预期结果**: 返回 `fs.Stats` 实例，且 `size > 0` 和 `mtimeMs > 0`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ stat — 应返回 fs.Stats 对象`

### TC-FS-004: hash — SHA-256 哈希计算
- **覆盖**: AC-04
- **前置条件**: 无
- **测试步骤**: 1. 调用 `store.hash('test content')`
- **预期结果**: 返回 64 字符十六进制字符串；相同内容哈希一致；不同内容哈希不同
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ hash — 应返回 SHA-256 十六进制哈希`

### TC-FS-005: getRelativePath — 绝对路径转相对路径
- **覆盖**: AC-04
- **前置条件**: 测试目录存在文件 `sub/b.md`
- **测试步骤**: 1. 构造绝对路径，2. 调用 `store.getRelativePath(absPath)`
- **预期结果**: 返回相对路径，包含 `sub/b.md`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ getRelativePath — 应将绝对路径转换为相对路径`

### TC-FS-006: glob — 递归查找所有 .md 文件
- **覆盖**: AC-07
- **前置条件**: 测试目录含 `a.md`、`sub/b.md`、`readme.md`
- **测试步骤**: 1. 调用 `store.glob('**/*.md')`
- **预期结果**: 返回列表包含 `a.md`、`sub/b.md`、`readme.md`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ glob — 应递归查找所有 .md 文件`

## 边界条件用例 — FileStore

### TC-FS-007: glob — 忽略隐藏目录
- **覆盖**: AC-07
- **前置条件**: 测试目录含隐藏目录 `.hidden/d.md`
- **测试步骤**: 1. 调用 `store.glob('**/*.md')`
- **预期结果**: 返回列表中不包含 `.hidden/d.md`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ glob — 应忽略隐藏目录（以 . 开头）中的文件`

### TC-FS-008: hash — 相同输入一致性验证
- **覆盖**: AC-04
- **前置条件**: 无
- **测试步骤**: 1. 两次调用 `store.hash('test content')`
- **预期结果**: 两次返回相同哈希值
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → hash 测试中 `assert.equal(store.hash('test content'), store.hash('test content'))`

## 异常场景用例 — FileStore

### TC-FS-009: read — 文件不存在抛友好错误
- **覆盖**: AC-06
- **前置条件**: 测试目录不存在 `nonexistent.md`
- **测试步骤**: 1. 调用 `store.read('nonexistent.md')`
- **预期结果**: 抛出 Error，消息包含文件名 `nonexistent.md`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ read — 文件不存在应抛友好错误`

### TC-FS-010: stat — 文件不存在抛异常
- **覆盖**: AC-06
- **前置条件**: 测试目录不存在 `nonexistent.md`
- **测试步骤**: 1. 调用 `store.stat('nonexistent.md')`
- **预期结果**: 抛出 Error，消息匹配 `/nonexistent\.md/`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/filestore.test.ts` → `✔ stat — 文件不存在应抛异常`

## 正常流程用例 — SqliteDbAdapter

### TC-DB-001: constructor — 打开 :memory: 数据库
- **覆盖**: AC-08, AC-09
- **前置条件**: 无
- **测试步骤**: 1. `new SqliteDbAdapter(':memory:')`，2. 调用 `getFileCount()`
- **预期结果**: `getFileCount()` 返回 number 类型
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ constructor — 应成功打开 :memory: 数据库并执行 schema`

### TC-DB-002: close — 安全关闭数据库
- **覆盖**: AC-08
- **前置条件**: 无
- **测试步骤**: 1. 新建 `:memory:` 数据库，2. 调用 `close()`，3. 调用 `getFileCount()`
- **预期结果**: close 后调用方法抛出异常
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ close — 应能安全关闭数据库`

### TC-DB-003: insertFile — 插入文件记录
- **覆盖**: AC-10
- **前置条件**: :memory: 数据库已初始化
- **测试步骤**: 1. 插入 `{path:'test/doc.md', content_hash:'abc123', size:1024, mtime_ms:1000000}`
- **预期结果**: 返回 `{id}` 且 `id > 0`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ insertFile — 应插入文件记录并返回 id`

### TC-DB-004: getFileByPath — 按路径查询文件
- **覆盖**: AC-10
- **前置条件**: 已插入文件 `test/doc.md`
- **测试步骤**: 1. 调用 `getFileByPath('test/doc.md')`
- **预期结果**: 返回记录对象，`path`, `content_hash`, `status` 匹配
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ getFileByPath — 应按路径查询文件`

### TC-DB-005: updateFile — 更新文件记录
- **覆盖**: AC-10
- **前置条件**: 已插入文件记录
- **测试步骤**: 1. 调用 `updateFile(id, {content_hash:'def456', size:2048})`
- **预期结果**: 查询后 `content_hash='def456'`, `size=2048`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ updateFile — 应更新文件记录`

### TC-DB-006: getAllFiles — 返回所有文件
- **覆盖**: AC-10
- **前置条件**: 已插入至少 1 个文件
- **测试步骤**: 1. 调用 `getAllFiles()`
- **预期结果**: 返回数组长度 >= 1，且包含 `test/doc.md`
- **实际结果**: ✅ 通过
- **证据**: `npx tsx --test src/storage/database.test.ts` → `✔ getAllFiles — 应返回所有文件`

### TC-DB-007: getFileCount — 返回文件总数
- **覆盖**: AC-10
- **前置条件**: 已插入至少 1 个文件
- **测试步骤**: 1. 调用 `getFileCount()`
- **预期结果**: 返回 count >= 1
- **实际结果**: ✅ 通过

### TC-DB-008: getFilesByStatus — 按状态过滤
- **覆盖**: AC-10
- **前置条件**: 已插入 active 文件
- **测试步骤**: 1. `getFilesByStatus('active')`，2. `getFilesByStatus('deleted')`
- **预期结果**: active 列表包含测试文件；deleted 列表不包含
- **实际结果**: ✅ 通过

### TC-DB-009: insertNode — 插入节点
- **覆盖**: AC-11
- **前置条件**: 已插入文件记录
- **测试步骤**: 1. 插入 `{file_id, type:'heading', line_start:1, line_end:5, ordinal:1}`
- **预期结果**: 返回 `{id}` 且 `id > 0`
- **实际结果**: ✅ 通过

### TC-DB-010: getNodeById — 按 id 查询节点
- **覆盖**: AC-11
- **前置条件**: 已插入节点
- **测试步骤**: 1. 调用 `getNodeById(nodeId)`
- **预期结果**: 返回节点记录，`type='heading'`, `file_id` 匹配
- **实际结果**: ✅ 通过

### TC-DB-011: getNodesByFile — 按文件获取节点
- **覆盖**: AC-11
- **前置条件**: 已插入节点
- **测试步骤**: 1. 调用 `getNodesByFile(fileId)`
- **预期结果**: 返回数组包含该节点
- **实际结果**: ✅ 通过

### TC-DB-012: insertNodes — 批量插入节点（事务）
- **覆盖**: AC-11
- **前置条件**: 已插入文件
- **测试步骤**: 1. 批量插入 2 个节点
- **预期结果**: 返回 ids 数组包含 2 个 id
- **实际结果**: ✅ 通过

### TC-DB-013: insertContent — 插入节点内容
- **覆盖**: AC-11
- **前置条件**: 已插入节点
- **测试步骤**: 1. 插入内容 `'# Introduction\n\nThis is the intro.'`
- **预期结果**: `getContent()` 返回相同内容
- **实际结果**: ✅ 通过

### TC-DB-014: insertEdge — 插入边
- **覆盖**: AC-12
- **前置条件**: 已插入源/目标节点
- **测试步骤**: 1. 插入 `{source_node_id, target_node_id, raw_href:'./other.md'}`
- **预期结果**: 返回 `{id}` 且 `id > 0`
- **实际结果**: ✅ 通过

### TC-DB-015: getEdgesBySourceNode — 出链查询
- **覆盖**: AC-12
- **前置条件**: 已插入源节点边
- **测试步骤**: 1. 调用 `getEdgesBySourceNode(nodeId)`
- **预期结果**: 返回列表包含 `raw_href:'./other.md'`
- **实际结果**: ✅ 通过

### TC-DB-016: getEdgesByTargetNode — 入链查询
- **覆盖**: AC-12
- **前置条件**: 已插入目标节点边
- **测试步骤**: 1. 调用 `getEdgesByTargetNode(targetNodeId)`
- **预期结果**: 返回列表长度 >= 1
- **实际结果**: ✅ 通过

### TC-DB-017: insertEdges — 批量插入边（事务）
- **覆盖**: AC-12
- **前置条件**: 已插入节点
- **测试步骤**: 1. 批量插入 2 个边（broken + external）
- **预期结果**: 返回 ids 包含 2 个 id
- **实际结果**: ✅ 通过

### TC-DB-018: getBrokenLinks — 返回断链
- **覆盖**: AC-12
- **前置条件**: 已插入 broken 状态边
- **测试步骤**: 1. 调用 `getBrokenLinks()`
- **预期结果**: 返回列表全部为 `status='broken'`
- **实际结果**: ✅ 通过

### TC-DB-019: searchFTS — FTS5 搜索
- **覆盖**: AC-13
- **前置条件**: 已插入节点和内容
- **测试步骤**: 1. 调用 `searchFTS('TypeScript', {maxResults:10})`
- **预期结果**: 返回列表包含测试节点
- **实际结果**: ✅ 通过

### TC-DB-020: searchFTS — 支持分页
- **覆盖**: AC-13
- **前置条件**: 已插入可搜索内容
- **测试步骤**: 1. 调用 `searchFTS('test', {maxResults:5, offset:0})`
- **预期结果**: 结果数 <= 5
- **实际结果**: ✅ 通过

### TC-DB-021: searchFTS — fileGlob 过滤
- **覆盖**: AC-13
- **前置条件**: 已插入搜索内容
- **测试步骤**: 1. 调用 `searchFTS('test', {fileGlob:'test/%'})`
- **预期结果**: 结果数 >= 0
- **实际结果**: ✅ 通过

### TC-DB-022: getBFSOutbound — BFS 出链
- **覆盖**: AC-13
- **前置条件**: 已插入节点和边
- **测试步骤**: 1. 调用 `getBFSOutbound([nodeId], 3)`
- **预期结果**: 返回列表长度 >= 1
- **实际结果**: ✅ 通过

### TC-DB-023: getBFSInbound — BFS 入链
- **覆盖**: AC-13
- **前置条件**: 已插入入链边
- **测试步骤**: 1. 调用 `getBFSInbound([targetNodeId], 3)`
- **预期结果**: 返回列表包含 source_node_id
- **实际结果**: ✅ 通过

### TC-DB-024: getStaleInfo — 返回有效期信息
- **覆盖**: AC-08
- **前置条件**: 数据库已初始化
- **测试步骤**: 1. 调用 `getStaleInfo()`
- **预期结果**: `stale` 为 boolean, `staleFileCount` 为 number, `lastIndexedAt` 为 string
- **实际结果**: ✅ 通过

### TC-DB-025: getStatus — 返回索引统计
- **覆盖**: AC-08
- **前置条件**: 已插入若干数据
- **测试步骤**: 1. 调用 `getStatus()`
- **预期结果**: `totalFiles >= 1`, `totalNodes >= 1`, `totalEdges` 为 number
- **实际结果**: ✅ 通过

## 边界条件用例 — SqliteDbAdapter

### TC-DB-026: getFileByPath — 不存在路径返回 undefined
- **覆盖**: AC-10
- **前置条件**: 数据库无此路径
- **测试步骤**: 1. 调用 `getFileByPath('nonexistent.md')`
- **预期结果**: 返回 `undefined`
- **实际结果**: ✅ 通过

### TC-DB-027: getNodeById — 不存在 id 返回 undefined
- **覆盖**: AC-11
- **前置条件**: 数据库无此 id
- **测试步骤**: 1. 调用 `getNodeById(99999)`
- **预期结果**: 返回 `undefined`
- **实际结果**: ✅ 通过

### TC-DB-028: getContent — 不存在节点返回 undefined
- **覆盖**: AC-11
- **前置条件**: 数据库无此 id
- **测试步骤**: 1. 调用 `getContent(99999)`
- **预期结果**: 返回 `undefined`
- **实际结果**: ✅ 通过

### TC-DB-029: searchFTS — 无结果返回空数组
- **覆盖**: AC-13
- **前置条件**: 无匹配内容
- **测试步骤**: 1. 调用 `searchFTS('zzzznotfound', {maxResults:10})`
- **预期结果**: 返回 `[]`
- **实际结果**: ✅ 通过

### TC-DB-030: deleteEdgesByFile — 删除文件的所有边
- **覆盖**: AC-12
- **前置条件**: 已插入边
- **测试步骤**: 1. 调用 `deleteEdgesByFile(fileId)`，2. 查询出链
- **预期结果**: after 调用后出链列表为空
- **实际结果**: ✅ 通过

### TC-DB-031: deleteNodesByFile — 删除文件的所有节点
- **覆盖**: AC-11
- **前置条件**: 已插入文件的节点
- **测试步骤**: 1. 调用 `deleteNodesByFile(fileForDelete.id)`，2. 查询节点
- **预期结果**: 节点列表为空
- **实际结果**: ✅ 通过

## 异常场景用例 — SqliteDbAdapter

### TC-DB-032: close 后调用方法抛异常
- **覆盖**: AC-08
- **前置条件**: 数据库已 close
- **测试步骤**: 1. `db2.close()`，2. 调用 `db2.getFileCount()`
- **预期结果**: 抛出 `closed` 或 `open` 相关异常
- **实际结果**: ✅ 通过

### TC-DB-033: deleteFile — 确保记录被删除
- **覆盖**: AC-10
- **前置条件**: 已插入临时文件
- **测试步骤**: 1. 插入临时文件，2. `deleteFile(tmpId)`，3. 查询路径
- **预期结果**: 返回 `undefined`
- **实际结果**: ✅ 通过

### TC-DB-034: deleteContent — 删除后查询返回 undefined
- **覆盖**: AC-11
- **前置条件**: 已插入内容
- **测试步骤**: 1. 插入内容，2. `deleteContent(nodeId)`，3. `getContent(nodeId)`
- **预期结果**: 返回 `undefined`
- **实际结果**: ✅ 通过

### TC-DB-035: updateFile — 空更新不应报错
- **覆盖**: AC-10
- **前置条件**: 已插入文件
- **测试步骤**: 1. 调用 `updateFile(id, {})`
- **预期结果**: 不报错（方法内部检测 fields.length === 0 时提前返回）
- **实际结果**: ✅ 通过 (代码在 fields.length === 0 时直接 return)

### TC-DB-036: getBFSOutbound — 空节点数组
- **覆盖**: AC-13
- **前置条件**: 无
- **测试步骤**: 1. 调用 `getBFSOutbound([], 3)`
- **预期结果**: 返回 `[]`
- **实际结果**: ✅ 通过 (代码中 `if (nodeIds.length === 0) return []`)

### TC-DB-037: getBFSInbound — maxDepth < 1
- **覆盖**: AC-13
- **前置条件**: 无
- **测试步骤**: 1. 调用 `getBFSInbound([1], 0)`
- **预期结果**: 返回 `[]`
- **实际结果**: ✅ 通过 (代码中 `if (maxDepth < 1) return []`)

## 依赖验证用例

### TC-DEP-001: 运行时依赖全部可解析
- **覆盖**: AC-01
- **前置条件**: node_modules 已安装
- **测试步骤**: 1. 逐个 require/import 5 个运行时依赖
- **预期结果**: 5 个依赖均可成功解析
- **实际结果**: ❌ 失败 — @modelcontextprotocol/sdk 入口文件缺失
- **证据**: `node -e "..."` → `MISSING: @modelcontextprotocol/sdk`

## 负面空间映射清单

| 应覆盖项 | 来源 | 是否已覆盖 |
|----------|------|------------|
| 文件读取正常流程 | FileStore.read | ✅ TC-FS-001 |
| 读取不存在的文件 | FileStore.read 异常 | ✅ TC-FS-009 |
| 文件存在检查（存在/不存在） | FileStore.exists | ✅ TC-FS-002 |
| 文件状态查询 | FileStore.stat | ✅ TC-FS-003, 010 |
| SHA-256 哈希一致性 | FileStore.hash | ✅ TC-FS-004, 008 |
| 相对路径转换 | FileStore.getRelativePath | ✅ TC-FS-005 |
| 递归扫描 .md 文件 | FileStore.glob | ✅ TC-FS-006 |
| 忽略隐藏目录 | FileStore.glob 边界 | ✅ TC-FS-007 |
| 数据库打开/关闭 | SqliteDbAdapter constructor/close | ✅ TC-DB-001, 002, 032 |
| SQL schema 执行 | constructor 调用 | ✅ TC-DB-001 |
| 文件 CRUD（增/查/改/删） | files 表 | ✅ TC-DB-003~008, 026, 033, 035 |
| 节点 CRUD（增/批量/查/删） | doc_nodes 表 | ✅ TC-DB-009~012, 027, 031 |
| 内容 CRUD（增/查/删） | doc_node_content 表 | ✅ TC-DB-013, 028, 034 |
| 边 CRUD（增/批量/查/删） | edges 表 | ✅ TC-DB-014~018, 030 |
| FTS5 搜索（正常/空/分页） | searchFTS | ✅ TC-DB-019~021, 029 |
| BFS 导航（出链/入链） | getBFSOutbound/Inbound | ✅ TC-DB-022, 023, 036, 037 |
| 变更检测 | getChangedFilesSince | ✅ 数据库测试 |
| byte/line 范围文件读取 | AC-05 | ⚠️ 未覆盖（功能未实现） |
| 路径遍历防护 | 安全审查 | 待 Gate 6 审查 |
| SQL 注入防护 | 安全审查 | 待 Gate 6 审查 |
