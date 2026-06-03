// =============================================================================
// Indexer 单元测试
// TDD: RED → GREEN → REFACTOR
// 覆盖全量/增量/重建三种索引模式 + 变更差异计算
// =============================================================================
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileStore } from '../storage/filestore.js';
import { SqliteDbAdapter } from '../storage/database.js';
import { ParserRegistry, registerDefaultParsers } from './parser/index.js';
import { Indexer } from './indexer.js';

const TEST_DIR = path.join(os.tmpdir(), 'md-graph-indexer-test-' + Date.now());

describe('Indexer', () => {
  let fileStore: FileStore;
  let db: SqliteDbAdapter;
  let indexer: Indexer;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'docs'), { recursive: true });

    // 注册默认解析器
    ParserRegistry.clear();
    registerDefaultParsers();

    fileStore = new FileStore(TEST_DIR);
    db = new SqliteDbAdapter(':memory:');
    indexer = new Indexer(fileStore, db, ParserRegistry);
  });

  after(() => {
    db.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    // 每个测试前清理数据库和测试文件
    const files = db.getAllFiles();
    for (const f of files) {
      db.deleteNodesByFile(f.id);
      db.deleteFile(f.id);
    }
    // 清理并重新创建 docs 目录
    const docsDir = path.join(TEST_DIR, 'docs');
    if (fs.existsSync(docsDir)) {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'intro.md'), '# Introduction\n\nWelcome to the docs.', 'utf-8');
    fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide\n\n## Setup\n\nRun `npm install`.\n\n## Usage\n\nSee [details](./intro.md).', 'utf-8');
  });

  // ---------------------------------------------------------------------------
  // 构造函数
  // ---------------------------------------------------------------------------
  it('constructor — 应使用依赖创建 Indexer', () => {
    const idx = new Indexer(fileStore, db, ParserRegistry);
    assert.ok(idx instanceof Indexer);
  });

  // ---------------------------------------------------------------------------
  // fullIndex — 全量索引
  // ---------------------------------------------------------------------------
  it('fullIndex — 应索引所有 .md 文件', async () => {
    const result = await indexer.fullIndex(TEST_DIR);
    assert.ok(result.totalFiles >= 2, '应找到至少 2 个 MD 文件');
    assert.equal(result.failedCount, 0, '不应有失败文件');
    assert.ok(result.indexedCount >= 2, '应索引至少 2 个文件');
    assert.ok(result.durationMs > 0, '应有正数耗时');
    assert.ok(result.lastIndexedAt, '应有索引时间戳');
    // 验证数据库中有节点
    assert.ok(db.getNodeCount() > 0, '数据库中应有节点');
    assert.ok(db.getEdgeCount() >= 0);
  });

  it('fullIndex — 同一内容再次索引应跳过', async () => {
    await indexer.fullIndex(TEST_DIR);
    const firstNodeCount = db.getNodeCount();
    const firstEdgeCount = db.getEdgeCount();

    // 再次索引（内容未变）
    const result = await indexer.fullIndex(TEST_DIR);
    assert.equal(result.indexedCount, 0, '无变更时应跳过所有文件');
    // 数据库内容应不变
    assert.equal(db.getNodeCount(), firstNodeCount);
    assert.equal(db.getEdgeCount(), firstEdgeCount);
  });

  it('fullIndex — 内容变更后应重新索引', async () => {
    await indexer.fullIndex(TEST_DIR);
    const firstNodeCount = db.getNodeCount();

    // 修改文件内容
    fs.writeFileSync(path.join(TEST_DIR, 'docs', 'intro.md'), '# Introduction V2\n\nUpdated content.', 'utf-8');

    const result = await indexer.fullIndex(TEST_DIR);
    assert.ok(result.indexedCount >= 1, '应重新索引变更文件');
    // 节点数量可能因内容变化而不同
    assert.ok(db.getNodeCount() > 0);
  });

  // ---------------------------------------------------------------------------
  // incrementalIndex — 增量索引
  // ---------------------------------------------------------------------------
  it('incrementalIndex — 首次运行应等同全量索引', async () => {
    const result = await indexer.incrementalIndex(TEST_DIR);
    assert.ok(result.totalFiles >= 2);
    assert.ok(result.indexedCount >= 2);
    assert.equal(result.failedCount, 0);
  });

  it('incrementalIndex — 无变更文件应跳过', async () => {
    await indexer.incrementalIndex(TEST_DIR);
    const result = await indexer.incrementalIndex(TEST_DIR);
    assert.equal(result.indexedCount, 0, '增量无变更时不应索引任何文件');
  });

  it('incrementalIndex — 修改文件后应只索引变更文件', async () => {
    await indexer.incrementalIndex(TEST_DIR);

    // 修改一个文件
    fs.writeFileSync(path.join(TEST_DIR, 'docs', 'guide.md'), '# Guide V2', 'utf-8');

    const result = await indexer.incrementalIndex(TEST_DIR);
    assert.equal(result.indexedCount, 1, '应只索引一个变更文件');
    assert.equal(result.totalFiles, 2, '应仍检测到 2 个文件');
  });

  it('incrementalIndex — 新文件应被索引', async () => {
    await indexer.incrementalIndex(TEST_DIR);

    // 添加新文件
    fs.writeFileSync(path.join(TEST_DIR, 'docs', 'new.md'), '# New doc', 'utf-8');

    const result = await indexer.incrementalIndex(TEST_DIR);
    assert.equal(result.indexedCount, 1, '应索引新文件');
  });

  it('incrementalIndex — 删除文件应标记为 deleted', async () => {
    await indexer.incrementalIndex(TEST_DIR);

    // 删除一个文件
    fs.unlinkSync(path.join(TEST_DIR, 'docs', 'guide.md'));

    const result = await indexer.incrementalIndex(TEST_DIR);
    assert.equal(result.totalFiles, 1, '应检测到文件减少');

    // 数据库中对应的文件应标记为 deleted
    const fileRecord = db.getFileByPath('docs/guide.md');
    assert.ok(!fileRecord || fileRecord.status === 'deleted',
      '已删除文件应在 DB 中标记为 deleted 或不存在');
  });

  // ---------------------------------------------------------------------------
  // rebuildIndex — 重建索引
  // ---------------------------------------------------------------------------
  it('rebuildIndex — 应清空并重新索引所有文件', async () => {
    await indexer.fullIndex(TEST_DIR);
    const preCount = db.getNodeCount();

    // 修改文件
    fs.writeFileSync(path.join(TEST_DIR, 'docs', 'intro.md'), '# Rebuilt', 'utf-8');

    const result = await indexer.rebuildIndex(TEST_DIR);
    assert.ok(result.indexedCount >= 2, '重建应重新索引所有文件');
    assert.equal(result.failedCount, 0);
    // 节点数量可能变化（内容变了）
    assert.ok(db.getNodeCount() > 0);
  });

  it('rebuildIndex — 空目录应返回零计数', async () => {
    const emptyDir = path.join(os.tmpdir(), 'md-graph-empty-' + Date.now());
    fs.mkdirSync(emptyDir, { recursive: true });

    const result = await indexer.rebuildIndex(emptyDir);
    assert.equal(result.indexedCount, 0);
    assert.equal(result.totalFiles, 0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // computeChanges — 变更差异计算
  // ---------------------------------------------------------------------------
  it('computeChanges — 应检测新增节点', async () => {
    // 模拟旧节点为空，新节点有内容
    const changes = indexer.computeChanges([], [
      { headingPath: 'Intro', lineStart: 1, lineEnd: 1 },
    ]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, 'added');
  });

  it('computeChanges — 应检测修改节点', () => {
    // 旧节点和新节点具有相同的 headingPath 但不同的 lineRanges
    const changes = indexer.computeChanges(
      [{ heading_path: 'Intro', line_ranges: '1-5' }],
      [{ headingPath: 'Intro', lineStart: 1, lineEnd: 10 }],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, 'modified');
  });

  it('computeChanges — 应检测删除节点', () => {
    const changes = indexer.computeChanges(
      [{ heading_path: 'Intro' }, { heading_path: 'Old Section' }],
      [{ headingPath: 'Intro' }],
    );
    const deleted = changes.filter(c => c.type === 'deleted');
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].headingPath, 'Old Section');
  });

  it('computeChanges — 无变化应返回空数组', () => {
    const changes = indexer.computeChanges(
      [{ heading_path: 'Stable', line_ranges: '1-5' }],
      [{ headingPath: 'Stable', lineStart: 1, lineEnd: 5 }],
    );
    assert.equal(changes.length, 0);
  });
});
