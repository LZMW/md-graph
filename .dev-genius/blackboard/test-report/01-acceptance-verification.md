# 验收标准验证 — 第 2 批: T-002, T-005, T-006

> gen: gen-1 | 验证时间: 2026-06-03T23:05:00+08:00

## 验证统计

| 任务 | 验收标准数 | 通过 | 失败 | 无法验证 |
|------|-----------|------|------|---------|
| T-002 | 3 | 2 | 1 | 0 |
| T-005 | 4 | 3 | 0 | 1 |
| T-006 | 6 | 6 | 0 | 0 |
| **合计** | **13** | **11** | **1** | **1** |

## T-002: npm install / 项目构建环境验证

### AC-01: 5 个运行时依赖安装成功

| 依赖 | 状态 | 证据 |
|------|------|------|
| better-sqlite3 ^12.10.0 | OK | `require.resolve('better-sqlite3')` 成功 |
| chokidar ^4.0.0 | OK | `require.resolve('chokidar')` 成功 |
| commander ^12.0.0 | OK | `require.resolve('commander')` 成功 |
| markdown-it ^14.0.0 | OK | `require.resolve('markdown-it')` 成功 |
| @modelcontextprotocol/sdk ^1.0.0 | MISSING | `import()` 失败：找不到 `dist/esm/index.js` |

**结果**: ❌ 部分失败 — `@modelcontextprotocol/sdk` 虽然安装在 node_modules 中，但其 `dist/esm/index.js` 入口文件缺失，无法被 `import()` 解析。

**证据命令**:
```bash
node -e "const pkgs = ['better-sqlite3','chokidar','commander','markdown-it','@modelcontextprotocol/sdk']; pkgs.forEach(p => { try { require.resolve(p); console.log('OK: ' + p); } catch(e) { console.log('MISSING: ' + p); } });"
```
输出:
```
OK: better-sqlite3
OK: chokidar
OK: commander
OK: markdown-it
MISSING: @modelcontextprotocol/sdk
```

### AC-02: TypeScript 可编译

**结果**: ✅ 通过

**证据命令**:
```bash
cd N:/编程工作室/mcp/md-graph && npx tsc --noEmit
```
输出: (无输出 — 表示编译无错误)

编译产物确认:
```bash
ls dist/storage/
```
输出: database.js, database.d.ts, database.test.js, database.test.d.ts, filestore.js, filestore.d.ts, filestore.test.js, filestore.test.d.ts 均已生成

### AC-03: 47 测试通过

**结果**: ✅ 通过

**证据命令**:
```bash
cd N:/编程工作室/mcp/md-graph && npx tsx --test src/storage/filestore.test.ts && npx tsx --test src/storage/database.test.ts
```

**FileStore (10 个测试)** — 全部通过:
```
▶ FileStore
  ✔ read — 应读取 UTF-8 文件内容
  ✔ read — 文件不存在应抛友好错误
  ✔ exists — 文件存在应返回 true
  ✔ exists — 文件不存在应返回 false
  ✔ stat — 应返回 fs.Stats 对象
  ✔ stat — 文件不存在应抛异常
  ✔ hash — 应返回 SHA-256 十六进制哈希
  ✔ getRelativePath — 应将绝对路径转换为相对路径
  ✔ glob — 应递归查找所有 .md 文件
  ✔ glob — 应忽略隐藏目录（以 . 开头）中的文件
✔ FileStore (30.9929ms)
ℹ tests 10, pass 10, fail 0
```

**SqliteDbAdapter (37 个测试)** — 全部通过:
```
▶ SqliteDbAdapter
  ✔ constructor — 应成功打开 :memory: 数据库并执行 schema
  ✔ close — 应能安全关闭数据库
  ✔ insertFile — 应插入文件记录并返回 id
  ✔ getFileByPath — 应按路径查询文件
  ✔ getFileByPath — 不存在的路径应返回 undefined
  ✔ updateFile — 应更新文件记录
  ✔ getAllFiles — 应返回所有文件
  ✔ getFileCount — 应返回文件总数
  ✔ getFilesByStatus — 应按状态过滤文件
  ✔ deleteFile — 应删除文件记录
  ✔ insertNode — 应插入节点并返回 id
  ✔ getNodeById — 应按 id 查询节点
  ✔ getNodeById — 不存在的 id 应返回 undefined
  ✔ getNodesByFile — 应按文件 id 获取所有节点
  ✔ getNodeCount — 应返回节点总数
  ✔ insertNodes — 应批量插入节点（事务）
  ✔ deleteNodesByFile — 应删除文件的所有节点
  ✔ insertContent — 应插入节点内容
  ✔ getContent — 不存在的节点应返回 undefined
  ✔ deleteContent — 应删除节点内容
  ✔ insertEdge — 应插入边并返回 id
  ✔ getEdgesBySourceNode — 应按源节点查询出链
  ✔ getEdgesByTargetNode — 应按目标节点查询入链
  ✔ getEdgeCount — 应返回边总数
  ✔ insertEdges — 应批量插入边（事务）
  ✔ getBrokenLinks — 应返回所有 broken 状态的边
  ✔ deleteEdgesByFile — 应删除文件的所有边
  ✔ searchFTS — 应返回 FTS5 搜索结果
  ✔ searchFTS — 无结果应返回空数组
  ✔ searchFTS — 支持分页参数
  ✔ searchFTS — 支持 fileGlob 过滤
  ✔ getBFSOutbound — 应返回 BFS 出链
  ✔ getBFSInbound — 应返回 BFS 入链
  ✔ getStaleInfo — 应返回 staleness 信息
  ✔ getStatus — 应返回索引统计
  ✔ getFileChangeDetails — 应返回文件的变更详情 JSON
  ✔ getChangedFilesSince — 应按时间筛选变更文件
✔ SqliteDbAdapter (27.8075ms)
ℹ tests 37, pass 37, fail 0
```

**汇总**: 总计 47 个测试，47 通过，0 失败。

## T-005: FileStore 验证

### AC-04: FileStore.read 能正确读取文件内容

**结果**: ✅ 通过

**证据命令**:
```bash
npx tsx --test src/storage/filestore.test.ts
```
TC-001 截图: `read — 应读取 UTF-8 文件内容` 通过。测试创建含 `# Hello\nWorld` 文件，验证 `store.read('a.md')` 返回 `'# Hello\nWorld'`。

### AC-05: FileStore 按 byte/line 范围读取正确

**结果**: ⚠️ 无法验证 — 当前 FileStore 实现仅支持 `read(relativePath: string): Promise<string>` 整文件读取，未提供 byte 范围或 line 范围的读取接口。该验收标准对应的功能尚未实现。

### AC-06: 不存在的文件抛出正确错误

**结果**: ✅ 通过

**证据命令**:
```bash
npx tsx --test src/storage/filestore.test.ts
```
TC-002 截图: `read — 文件不存在应抛友好错误` 通过。调用 `store.read('nonexistent.md')` 时，错误消息包含文件名 `nonexistent.md`。

### AC-07: FileStore glob 能递归扫描且忽略隐藏目录

**结果**: ✅ 通过

**证据命令**:
```bash
npx tsx --test src/storage/filestore.test.ts
```
TC-009/TC-010 截图: `glob — 应递归查找所有 .md 文件` 和 `glob — 应忽略隐藏目录` 均通过。测试验证 `.hidden/d.md` 不在 glob 结果中。

## T-006: SqliteDbAdapter 验证

### AC-08: 数据库打开/关闭正常

**结果**: ✅ 通过

**证据命令**:
```bash
npx tsx --test src/storage/database.test.ts
```
- `constructor — 应成功打开 :memory: 数据库并执行 schema` 通过
- `close — 应能安全关闭数据库` 通过，且关闭后调用方法抛异常

### AC-09: schema.sql 执行成功

**结果**: ✅ 通过

构造函数中调用 `executeSchema()` 创建 4 张表（files, doc_nodes, doc_node_content, edges）+ 1 个 FTS5 虚拟表 + 3 个触发器 + 9 个索引。所有 CRUD 测试均成功运行，证明 schema 已正确加载。

### AC-10: 文件 CRUD 操作正确

**结果**: ✅ 通过

| 操作 | 测试 | 结果 |
|------|------|------|
| insertFile | 插入并返回 id | 通过 |
| getFileByPath | 按路径查询 | 通过 |
| getFileByPath (不存在) | 返回 undefined | 通过 |
| updateFile | 更新 hash/size | 通过 |
| getAllFiles | 返回所有文件 | 通过 |
| getFileCount | 返回总数 | 通过 |
| getFilesByStatus | 按状态过滤 | 通过 |
| deleteFile | 删除记录 | 通过 |

### AC-11: 节点 CRUD 操作正确

**结果**: ✅ 通过

| 操作 | 测试 | 结果 |
|------|------|------|
| insertNode | 插入并返回 id | 通过 |
| getNodeById | 按 id 查询 | 通过 |
| getNodeById (不存在) | 返回 undefined | 通过 |
| getNodesByFile | 按文件查询 | 通过 |
| getNodeCount | 返回总数 | 通过 |
| insertNodes (批量事务) | 批量插入 | 通过 |
| deleteNodesByFile | 按文件删除 | 通过 |
| insertContent / getContent | 内容 CRUD | 通过 |

### AC-12: 边 CRUD 操作正确

**结果**: ✅ 通过

| 操作 | 测试 | 结果 |
|------|------|------|
| insertEdge | 插入并返回 id | 通过 |
| getEdgesBySourceNode | 出链查询 | 通过 |
| getEdgesByTargetNode | 入链查询 | 通过 |
| getEdgeCount | 返回总数 | 通过 |
| insertEdges (批量事务) | 批量插入 | 通过 |
| getBrokenLinks | 断链查询 | 通过 |
| deleteEdgesByFile | 按文件删除 | 通过 |

### AC-13: FTS5 搜索和导航操作正确

**结果**: ✅ 通过

| 操作 | 测试 | 结果 |
|------|------|------|
| searchFTS 正常搜索 | 返回匹配结果 | 通过 |
| searchFTS 无结果 | 返回空数组 | 通过 |
| searchFTS 分页 | 支持 maxResults/offset | 通过 |
| searchFTS fileGlob | SQL LIKE 过滤 | 通过 |
| getBFSOutbound | BFS 出链遍历 | 通过 |
| getBFSInbound | BFS 入链遍历 | 通过 |

## 逐项验证总表

| # | 验收标准 | 来源 | 结果 | 测试命令 | 输出摘要 |
|---|----------|------|------|----------|----------|
| AC-01 | 5 运行时依赖 | T-002 | ❌ | `node -e "..."` | 1/5 缺失: @modelcontextprotocol/sdk |
| AC-02 | TypeScript 编译 | T-002 | ✅ | `npx tsc --noEmit` | 无错误 |
| AC-03 | 47 测试通过 | T-002 | ✅ | `npx tsx --test` | 47 pass, 0 fail |
| AC-04 | FileStore 整文件读取 | T-005 | ✅ | `npx tsx --test filestore.test.ts` | read 测试通过 |
| AC-05 | FileStore 范围读取 | T-005 | ⚠️ | — | 功能未实现 |
| AC-06 | FileStore 不存在的文件报错 | T-005 | ✅ | `npx tsx --test filestore.test.ts` | 错误消息含文件名 |
| AC-07 | FileStore glob 递归扫描 | T-005 | ✅ | `npx tsx --test filestore.test.ts` | glob 测试通过 |
| AC-08 | 数据库打开/关闭 | T-006 | ✅ | `npx tsx --test database.test.ts` | constructor + close 通过 |
| AC-09 | schema.sql 执行 | T-006 | ✅ | `npx tsx --test database.test.ts` | 所有 CRUD 正常 |
| AC-10 | 文件 CRUD | T-006 | ✅ | `npx tsx --test database.test.ts` | 8 项文件操作全部通过 |
| AC-11 | 节点 CRUD | T-006 | ✅ | `npx tsx --test database.test.ts` | 8 项节点操作全部通过 |
| AC-12 | 边 CRUD | T-006 | ✅ | `npx tsx --test database.test.ts` | 7 项边操作全部通过 |
| AC-13 | FTS5 搜索 + BFS 导航 | T-006 | ✅ | `npx tsx --test database.test.ts` | 8 项搜索/导航全部通过 |

## 总体结论

- **通过**: 11/13
- **失败**: 1/13 (AC-01: @modelcontextprotocol/sdk 入口缺失)
- **无法验证**: 1/13 (AC-05: byte/line 范围读取功能未实现)
