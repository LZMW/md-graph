# 代码审查 — 第 2 批: T-005 (FileStore), T-006 (SqliteDbAdapter)

> gen: gen-1 | 审查时间: 2026-06-03T23:05:00+08:00
> 审查方法: Karpathy 四原则 + OWASP 安全

## 审查范围

| 文件 | 行数 | 语言 | 作用 |
|------|------|------|------|
| src/storage/filestore.ts | 153 | TypeScript | 文件系统存取：读取、扫描、哈希 |
| src/storage/filestore.test.ts | 116 | TypeScript | FileStore 单元测试 |
| src/storage/database.ts | 495 | TypeScript | SQLite 数据库封装：CRUD、FTS5、BFS |
| src/storage/database.test.ts | 351 | TypeScript | SqliteDbAdapter 单元测试 |
| src/storage/schema.sql | 145 | SQL | 数据库表结构 + FTS5 + 触发器 + 索引 |
| src/types.ts | 278 | TypeScript | 共享类型定义 |

---

## 第一部分: Karpathy 四原则审查

### 1.1 简洁性 (Simplicity)

**评分**: 良好 (8/10)

**分析**:
- FileStore (filestore.ts) 实现清晰，每个方法职责单一：read/stat/exists/glob/hash/getRelativePath。walkDir 作为内部递归方法，逻辑简洁。
- SqliteDbAdapter (database.ts) 方法按表分组（files/doc_nodes/doc_node_content/edges/搜索/导航/状态），代码组织有层次感。单文件 495 行，处于可管理范围内，但随功能增长应考虑拆分模块。
- schema.sql 使用了标准的 SQLite DDL，4 张表 + FTS5 + 3 触发器 + 9 索引，结构清晰。

**改进建议**:
1. `updateFile` 方法使用动态 SQL 构建（遍历 Object.entries 拼 SQL），逻辑上安全但增加了审查复杂度。建议改为显式字段更新或使用类型安全 ORM。

**当前代码** (database.ts 第 109-126 行):
```typescript
updateFile(id: number, data: Partial<FileInsert & { ... }>): void {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
            const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            fields.push(`${snakeKey} = @${snakeKey}`);
            values[snakeKey] = value;
        }
    }
    if (fields.length === 0) return;
    const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(values);
}
```

### 1.2 正确性 (Correctness)

**评分**: 良好 (9/10)

**分析**:
- FileStore.read/stat: 正确捕获 ENOENT 并转为友好消息。但所有错误都被捕获后转换成友好消息会丢失原始错误栈。
- FileStore.glob: 正确忽略以 `.` 开头的文件和目录。readdir 失败时静默返回（吞错误），适合扫描场景。
- SqliteDbAdapter: 
  - `insertNode` 使用参数化查询，`ON DELETE CASCADE` 正确配置。
  - BFS 使用递归 CTE，正确限制 depth 防止无限递归。
  - searchFTS 对查询词做了安全处理（去除非字母/中文/连字符字符）。
- schema.sql: CHECK 约束（status IN、type IN、searchable IN 0/1）确保数据完整性。
- FTS5 触发器正确同步 insert/delete/update 操作。

**发现的问题**:
1. `resolveSchemaPath` 在 try-catch 中静默忽略 `fileURLToPath(import.meta.url)` 错误，且 candidates 只有一个稳定路径 + 一个条件路径。如果当前工作目录不是项目根目录，schema.sql 可能找不到。
2. `read` 的 ENOENT 错误信息包含 `relativePath` 但未做路径泄露防护（虽然非敏感场景不需要）。

### 1.3 一致性 (Consistency)

**评分**: 良好 (8/10)

**分析**:
- 代码风格统一：使用 TypeScript、ESM 导入、class 封装、JSDoc 注释风格。
- 命名约定：方法名使用 camelCase，SQL 表字段使用 snake_case，与数据库规范一致。
- 错误处理：FileStore 和 SqliteDbAdapter 都使用 Error 对象抛异常。

**不一致点**:
1. FileStore 的方法有的是 async（read, glob），有的是 sync（stat, exists, hash）。虽然技术上合理（fs.promises 和 fsSync 混用），但增加了调用方的认知负担。
2. `getFileByPath` 和 `getNodeById` 返回 `Record | undefined`，而 `getAllFiles` 返回 `Record[]` — 单个查询返回 undefined 或 Record，这是正确的但文档中未明确标注 undefined 的风险。

### 1.4 性能 (Performance)

**评分**: 良好 (8/10)

**分析**:
- 关键查询都有索引覆盖（idx_files_path, idx_nodes_file_id, idx_edges_source, idx_edges_target, idx_edges_status, idx_nodes_type, idx_nodes_parent_id, idx_nodes_heading_path）。
- BFS CTE 使用 DISTINCT 避免重复边，参数化防止 SQL 注入的同时也为 SQLite 查询缓存提供命中率。但 DISTINCT 在大数据集上可能成为性能瓶颈。
- Schema 使用 WAL 模式，适合读多写少的索引场景。
- `insertNodes` 和 `insertEdges` 使用事务批处理，减少提交次数。

**潜在问题**:
1. `getAllFiles()` 和 `getFilesByStatus()` 可能在全表扫描时性能下降。当前规模下没问题，但如果有数十万文件记录，需考虑分页。
2. searchFTS 的 fileGlob LIKE 过滤在大数据集上无法利用索引（LIKE 以 % 开头时不会使用索引）。
3. `walkDir` 递归文件扫描没有并发限制，大规模目录树可能堆栈溢出。

---

## 第二部分: OWASP 安全审查

### 2.1 SQL 注入防护 — 评分: 优秀 (10/10)

**结论**: 所有数据库查询均使用参数化查询（prepared statements），无拼接 SQL 注入风险。

**逐条验证**:
- `insertFile`: 使用 `@path, @content_hash, ...` 命名参数 → 安全
- `updateFile`: 动态构建 SQL 但字段名为代码内部生成（非用户输入），值全部通过 `@param` 绑定 → 安全
- `getFileByPath`, `getNodeById` 等: 使用 `?` 位置参数 → 安全
- `searchFTS`: 查询词经 `safeQuery` 清洗（去除非字母/中文/连字符），然后通过 `?` 参数传递 → 安全
- `getBFSOutbound/Inbound`: nodeIds 虽然内联到 SQL 但实际是通过参数化的 `?` 占位符动态生成，非直接拼接 → 安全
- 所有 DELETE/UPDATE 语句：使用参数绑定 → 安全

### 2.2 路径遍历防护 — 评分: 需改进 (4/10)

**问题描述**: `FileStore.resolvePath` 使用 `path.join(rootPath, relativePath)`，但 `path.join` 不会阻止 `../` 相对路径跳转。

**漏洞复现**:
```
store.read('../../etc/passwd')  →  path.join('/data/docs', '../../etc/passwd')  →  '/etc/passwd'
```

**受影响方法**:
| 方法 | 风险 | 说明 |
|------|------|------|
| `read(relativePath)` | 高 | 攻击者可读取 rootPath 之外任意文件 |
| `stat(relativePath)` | 中 | 可探测 rootPath 之外的文件是否存在 |
| `exists(relativePath)` | 中 | 可探测 rootPath 之外的文件是否存在 |

**修复建议**: 解析后验证真实路径是否在 rootPath 范围内。示例：

```typescript
private resolvePath(relativePath: string): string {
    const fullPath = path.resolve(this.rootPath, relativePath);
    // 路径遍历防护：验证解析后的路径仍在 rootPath 之下
    if (!fullPath.startsWith(path.resolve(this.rootPath))) {
        throw new Error(`路径越界: ${relativePath}`);
    }
    return fullPath;
}
```

**风险等级**: P1 严重 — 路径遍历是 OWASP Top 10 经典漏洞 (A01:2021-Broken Access Control)。

### 2.3 数据库连接管理 — 评分: 良好 (8/10)

**分析**:
- SQLite 使用 WAL 模式，提供更好的并发读性能。
- foreign_keys 已启用，引用完整性有保障。
- `:memory:` 数据库支持良好，适合测试场景。
- 关闭后调用方法抛异常，行为正确。

**改进建议**:
1. 缺少自动关闭机制（如 `Symbol.dispose` 或 try-with-resources 模式）。调用方需要确保在 finally 块中调用 `close()`。
2. 未配置 busy_timeout，默认情况下 better-sqlite3 的 busy_timeout 为 0（立即抛出 SQLITE_BUSY）。对于可能被多进程访问的场景，建议设置：
```typescript
this.db.pragma('busy_timeout = 5000');
```

### 2.4 错误处理完整性 — 评分: 良好 (7/10)

**分析**:
- FileStore.read/stat: ENOENT 捕获并转为友好消息。其他错误直接冒泡。
- SqliteDbAdapter: 多数方法未做显式错误处理，让 better-sqlite3 自然抛出异常。符合"让异常冒泡"的最小错误处理原则。

**问题**:
1. `executeSchema` 的 `resolveSchemaPath` 如果找不到 schema.sql 会在构造函数中抛出异常，这可能导致数据库对象构造不完整。建议在抛出前关闭已打开的数据库连接。
2. 错误消息中暴露了 `relativePath` 和 `fileId` 等信息，虽然没有敏感数据，但需要注意。

### 2.5 输入验证 — 评分: 中等 (6/10)

**分析**:
- FileStore 的 `read`, `stat`, `exists` 未验证 `relativePath` 是否为空字符串、是否包含空字节等。
- `searchFTS` 的 query 清洗使用正则 `[^\w\s一-鿿-]` — 这个正则覆盖了大部分常见字符，但 Unicode 代理对、零宽字符等可能绕过。
- `getNodeById`, `getFileByPath` 等未验证 id/path 是否为 null/undefined。

**建议**:
- 在 public 方法入口添加参数断言（如 `if (!relativePath) throw new Error('路径不能为空')`）
- 对 `relativePath` 进行空字节检查（`\0`）

---

## 第三部分: 架构与设计审查

### 3.1 模块依赖

- FileStore 仅依赖 Node.js 内置模块（fs, path, crypto），无外部依赖 — 优秀。
- SqliteDbAdapter 依赖 better-sqlite3 外部包 — 合理。
- 两个模块都能独立测试（FileStore 用临时目录；SqliteDbAdapter 用 `:memory:`）。

### 3.2 测试覆盖

| 模块 | 测试数 | 关键场景覆盖 | 缺失场景 |
|------|--------|-------------|---------|
| FileStore | 10 | 读/存在/状态/哈希/相对路径/glob | 空路径、超长路径、路径遍历测试 |
| SqliteDbAdapter | 37 | 全部 CRUD + 搜索 + BFS + 变更检测 | 并发访问、大数据量、schema.sql 损坏恢复 |

### 3.3 代码度量

| 指标 | 值 | 评价 |
|------|-----|------|
| 文件平均行数 | 322 | 可接受 |
| 最大函数长度 | `executeSchema` (4行) + `searchFTS` (40行) | 良好 |
| 圈复杂度 | 各方法平均 3-5 | 低复杂度 |
| 注释密度 | ~25% (含头部注释) | 充分 |
| 测试/代码比 | 467行测试 / 648行代码 = 72% | 高于行业平均 |

---

## 审查结论

| 类别 | 评分 | 说明 |
|------|------|------|
| Karpathy 简洁性 | 8/10 | 代码组织清晰，updateFile 动态 SQL 略复杂 |
| Karpathy 正确性 | 9/10 | 逻辑正确，schema 路径解析有优化空间 |
| Karpathy 一致性 | 8/10 | 风格统一，async/sync 混合使用需注意 |
| Karpathy 性能 | 8/10 | 索引覆盖完善，LIKE 查询可能瓶颈 |
| SQL 注入防护 | 10/10 | 全部参数化查询，无拼接 |
| 路径遍历防护 | 4/10 | FileStore.resolvePath 缺少越界检查 |
| 数据库连接管理 | 8/10 | 缺少 busy_timeout，缺少自动关闭 |
| 错误处理完整性 | 7/10 | 最小化错误处理，构造函数异常需完善 |
| **综合** | **7.75/10** | 代码质量中上，路径遍历是主要安全风险 |

## 待处理问题

| # | 问题 | 严重程度 | 文件 | 建议修复 |
|---|------|---------|------|---------|
| CR-01 | FileStore 路径遍历漏洞 | P1 严重 | filestore.ts:115-117 | resolvePath 添加路径越界检查 |
| CR-02 | @modelcontextprotocol/sdk 依赖入口缺失 | P1 严重 | (环境) | 重新安装或构建 SDK |
| CR-03 | schema.sql 路径解析依赖 cwd | P2 一般 | database.ts:476 | 添加更多路径候选或配置化 |
| CR-04 | FileStore 缺少输入验证 | P2 一般 | filestore.ts | 添加空路径/空字节检查 |
| CR-05 | updateFile 动态 SQL 构建 | P3 建议 | database.ts:109-126 | 改用显式字段更新 |
| CR-06 | 未配置 busy_timeout | P3 建议 | database.ts:80 | 添加 `pragma('busy_timeout = 5000')` |
| CR-07 | FileStore 缺少 byte/line 范围读取 | P3 建议 | filestore.ts | 按需实现 readChunk/readLines |
