// =============================================================================
// FileWatcher — TDD 测试
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Watcher 将在实现后导入
let Watcher: typeof import('./watcher.js').Watcher;
let FileStore: typeof import('../storage/filestore.js').FileStore;

// 在 before 中动态导入
before(async () => {
  Watcher = (await import('./watcher.js')).Watcher;
  FileStore = (await import('../storage/filestore.js')).FileStore;
});

// =============================================================================
// 测试套件
// =============================================================================

describe('FileWatcher', () => {
  let tmpDir: string;
  let watcher: InstanceType<typeof Watcher>;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-graph-watcher-'));
  });

  after(() => {
    if (watcher) watcher.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('constructor — 应使用依赖创建 Watcher', () => {
    const indexer = { incrementalIndex: async () => ({ indexedCount: 0 }) };
    watcher = new Watcher(tmpDir, indexer as ConstructorParameters<typeof Watcher>[1]);
    assert.ok(watcher instanceof Watcher);
  });

  it('fileChange — 文件变更应加入 pending set', async () => {
    const indexer = { incrementalIndex: async () => ({ indexedCount: 0 }) };
    const w = new Watcher(tmpDir, indexer as ConstructorParameters<typeof Watcher>[1]);

    // 创建 .md 文件
    const testFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(testFile, '# Hello');

    // 模拟文件变更
    (w as any).onFileChange(testFile);

    const pending = (w as any).pendingFiles as Set<string>;
    assert.ok(pending.has(testFile), '文件应出现在 pending set 中');

    w.close();
  });

  it('debounce — 多次变更应合并为一次索引', async () => {
    let callCount = 0;
    const indexer = {
      incrementalIndex: async () => {
        callCount++;
        return { indexedCount: 0 };
      },
    };
    const w = new Watcher(tmpDir, indexer as ConstructorParameters<typeof Watcher>[1]);

    const testFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(testFile, '# Hello');

    // 多次触发变更
    (w as any).onFileChange(testFile);
    (w as any).onFileChange(testFile);
    (w as any).onFileChange(testFile);

    // 等待 debounce timer
    await new Promise(r => setTimeout(r, 400));

    assert.equal(callCount, 1, '多次变更应合并为一次索引调用');

    w.close();
  });

  it('stalenessCheck — 应检测 4 个字段的过时状态', async () => {
    const indexer = { incrementalIndex: async () => ({ indexedCount: 0 }) };
    const w = new Watcher(tmpDir, indexer as ConstructorParameters<typeof Watcher>[1]);

    // 创建文件
    const testFile = path.join(tmpDir, 'staleness.md');
    fs.writeFileSync(testFile, '# Staleness Test');

    // 模拟 DB 记录（全部匹配）
    const freshRecord = {
      path: testFile,
      size: fs.statSync(testFile).size,
      mtimeMs: fs.statSync(testFile).mtimeMs,
      contentHash: 'somehash',
    };
    const isStale1 = w.stalenessCheck(testFile, freshRecord);
    assert.equal(isStale1, false, '记录匹配不应 stale');

    // 模拟 DB 记录（size 不匹配）
    const sizeMismatch = {
      path: testFile,
      size: 99999,
      mtimeMs: fs.statSync(testFile).mtimeMs,
      contentHash: 'somehash',
    };
    const isStale2 = w.stalenessCheck(testFile, sizeMismatch);
    assert.equal(isStale2, true, 'size 不匹配应 stale');

    // 模拟 DB 记录（mtimeMs 不匹配）
    const mtimeMismatch = {
      path: testFile,
      size: fs.statSync(testFile).size,
      mtimeMs: 0,
      contentHash: 'somehash',
    };
    const isStale3 = w.stalenessCheck(testFile, mtimeMismatch);
    assert.equal(isStale3, true, 'mtime 不匹配应 stale');

    // 文件不存在
    const isStale4 = w.stalenessCheck('/nonexistent/file.md', freshRecord);
    assert.equal(isStale4, true, '不存在的文件应 stale');

    w.close();
  });

  it('isMdFile — 应正确判断 .md 文件', () => {
    const indexer = { incrementalIndex: async () => ({ indexedCount: 0 }) };
    const w = new Watcher(tmpDir, indexer as ConstructorParameters<typeof Watcher>[1]);

    assert.equal((w as any).isMdFile('file.md'), true);
    assert.equal((w as any).isMdFile('file.MD'), true, '大写扩展名应匹配');
    assert.equal((w as any).isMdFile('file.mdx'), true, '.mdx 应匹配');
    assert.equal((w as any).isMdFile('file.txt'), false);
    assert.equal((w as any).isMdFile('file'), false);

    w.close();
  });
});
