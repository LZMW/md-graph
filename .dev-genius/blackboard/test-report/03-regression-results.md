# 回归测试结果 — 第 2 批: T-002, T-005, T-006

> gen: gen-1 | 执行时间: 2026-06-03T23:05:00+08:00

## 回归范围

- **原 Bug 修复验证**: M-02 / M-03 (如 task-queue 所述)
- **关联功能验证**: FileStore 所有操作、SqliteDbAdapter 所有 CRUD、FTS5 搜索、BFS 导航

## M-02 / M-03 修复确认

由于缺少前一个版本的代码状态和 task-queue.md 中 M-02/M-03 的具体定义，以下通过当前代码行为和测试覆盖推理验证：

### M-02 可能涉及: FTS5 搜索功能完善

| 相关功能 | 状态 | 证据 |
|----------|------|------|
| searchFTS 正常搜索 | 正常 | TC-DB-019: 搜索 'TypeScript' 返回结果 |
| searchFTS 无结果 | 正常返回空数组 | TC-DB-029: 'zzzznotfound' 返回 [] |
| searchFTS 分页 | maxResults 和 offset 生效 | TC-DB-020: maxResults:5 返回 <=5 条 |
| searchFTS fileGlob 过滤 | SQL LIKE 转换正确 | TC-DB-021: glob 转 LIKE 模式 |
| FTS5 触发器同步 | insert/delete/update 自动同步 | schema.sql content_ai/ad/au 触发器 |

### M-03 可能涉及: BFS 导航功能完善

| 相关功能 | 状态 | 证据 |
|----------|------|------|
| getBFSOutbound 出链 | 递归 CTE 正常 | TC-DB-022: 返回 >= 1 条边 |
| getBFSInbound 入链 | 递归 CTE 正常 | TC-DB-023: 包含 source_node_id |
| 空节点数组保护 | 返回 [] | TC-DB-036: 空数组安全处理 |
| maxDepth < 1 保护 | 返回 [] | TC-DB-037: 无效 depth 安全处理 |

## 回归结果

| # | 测试用例 | 类型 | 结果 | 证据 |
|---|----------|------|------|------|
| 1 | FileStore 全部 10 个测试 | 回归 | 10/10 通过 | `npx tsx --test src/storage/filestore.test.ts` → pass 10, fail 0 |
| 2 | SqliteDbAdapter 全部 37 个测试 | 回归 | 37/37 通过 | `npx tsx --test src/storage/database.test.ts` → pass 37, fail 0 |
| 3 | TypeScript 编译 | 回归 | 编译成功 | `npx tsc --noEmit` → 无错误；`npx tsc` → dist 目录生成 |
| 4 | 编译后 JS 测试 | 回归 | 47/47 通过 | `node --test dist/storage/*.test.js` → pass 47, fail 0 |
| 5 | 运行时依赖解析 | 回归 | 4/5 正常 | @modelcontextprotocol/sdk 入口缺失 |

## 回归结论

- **原 Bug 是否修复**: 无历史对比基准，当前功能正常
- **是否引入新问题**: ⚠️ @modelcontextprotocol/sdk 依赖入口缺失（此问题为 npm install 阶段遗留，非本次修改引入）
- **回归通过**: ✅ 代码逻辑层全部通过，依赖问题需协调器关注
