// =============================================================================
// Searcher 单元测试
// TDD: RED → GREEN → REFACTOR
// 覆盖 FTS5 全文搜索 + 结果排序 + snippet 生成
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteDbAdapter } from '../storage/database.js';
import type { FileInsert, NodeInsert } from '../types.js';
import { Searcher } from './searcher.js';

describe('Searcher', () => {
  let db: SqliteDbAdapter;
  let searcher: Searcher;

  before(() => {
    db = new SqliteDbAdapter(':memory:');
    searcher = new Searcher(db, '.');

    // 准备测试数据
    const file1 = db.insertFile({
      path: 'docs/intro.md',
      content_hash: 'hash1',
      size: 100,
      mtime_ms: 1000,
    });
    const file2 = db.insertFile({
      path: 'docs/advanced.md',
      content_hash: 'hash2',
      size: 200,
      mtime_ms: 2000,
    });

    // 插入节点和内容
    const n1 = db.insertNode({
      file_id: file1.id, type: 'heading',
      line_start: 1, line_end: 1, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 1, heading_level: 1,
      heading_path: 'Introduction',
    });
    db.insertContent(n1.id, 'Introduction to TypeScript and Node.js development');

    const n2 = db.insertNode({
      file_id: file1.id, type: 'paragraph',
      line_start: 3, line_end: 3, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 2,
      heading_path: 'Introduction',
    });
    db.insertContent(n2.id, 'This guide covers TypeScript basics and advanced patterns.');

    const n3 = db.insertNode({
      file_id: file2.id, type: 'heading',
      line_start: 1, line_end: 1, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 1, heading_level: 1,
      heading_path: 'Advanced Topics',
    });
    db.insertContent(n3.id, 'Advanced TypeScript patterns for professionals');

    const n4 = db.insertNode({
      file_id: file2.id, type: 'paragraph',
      line_start: 3, line_end: 3, col_start: 0, col_end: 0,
      searchable: 1, ordinal: 2,
      heading_path: 'Advanced Topics',
    });
    db.insertContent(n4.id, 'Learn about generic constraints and conditional types.');

    // 非 searchable 节点
    const n5 = db.insertNode({
      file_id: file2.id, type: 'blockquote',
      line_start: 5, line_end: 5, col_start: 0, col_end: 0,
      searchable: 0, ordinal: 3,
    });
    db.insertContent(n5.id, 'This should not appear in results due to searchable=0');
  });

  after(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // 构造函数
  // ---------------------------------------------------------------------------
  it('constructor — 应使用 db 依赖创建 Searcher', () => {
    const s = new Searcher(db, '.');
    assert.ok(s instanceof Searcher);
  });

  // ---------------------------------------------------------------------------
  // search — 搜索
  // ---------------------------------------------------------------------------
  it('search — 应返回格式化搜索结果', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 10 });
    assert.ok(result.totalResults > 0, '应返回匹配结果');
    assert.ok(result.results.length > 0);
    assert.ok(result.results.every(r => r.id > 0));
    assert.ok(result.results.every(r => r.filePath));
    assert.ok(result.results.every(r => typeof r.score === 'number'));
  });

  it('search — 无匹配应返回空结果', async () => {
    const result = await searcher.search('zzzzzznotfound', { maxResults: 10 });
    assert.equal(result.totalResults, 0);
    assert.equal(result.results.length, 0);
  });

  it('search — 空查询应返回空结果', async () => {
    const result = await searcher.search('', { maxResults: 10 });
    assert.equal(result.totalResults, 0);
  });

  it('search — 应支持分页 (maxResults)', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 1 });
    assert.ok(result.results.length <= 1);
  });

  it('search — 搜索结果应包含 staleness 信息', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 1 });
    assert.ok(typeof result.stale === 'boolean');
    assert.ok(typeof result.staleFileCount === 'number');
    assert.ok(typeof result.lastIndexedAt === 'string');
  });

  it('search — 应返回按分数降序排列的结果', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 10 });
    if (result.results.length >= 2) {
      for (let i = 1; i < result.results.length; i++) {
        assert.ok(result.results[i - 1].score >= result.results[i].score,
          '结果应按 score 降序排列');
      }
    }
  });

  it('search — 应生成 snippet', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 10 });
    for (const item of result.results) {
      assert.ok(item.snippet, '每个结果应有 snippet');
      assert.ok(item.snippet.length > 0, 'snippet 不应为空');
    }
  });

  it('search — 结果应包含 headingPath', async () => {
    const result = await searcher.search('Introduction', { maxResults: 10 });
    assert.ok(result.results.length > 0);
    assert.ok(result.results.some(r => r.headingPath));
  });

  it('search — 应标记 stale 状态', async () => {
    const result = await searcher.search('TypeScript', { maxResults: 10 });
    assert.equal(typeof result.stale, 'boolean');
    assert.equal(typeof result.staleFileCount, 'number');
    assert.ok(result.lastIndexedAt);
  });

  // ---------------------------------------------------------------------------
  // generateSnippet — snippet 生成
  // ---------------------------------------------------------------------------
  it('generateSnippet — 应生成匹配上下文的 snippet', () => {
    const snippet = searcher.generateSnippet(
      'This is a long document about TypeScript and Node.js programming.',
      'TypeScript', 80
    );
    assert.ok(snippet);
    assert.ok(snippet.includes('TypeScript'), 'snippet 应包含匹配词');
    assert.ok(snippet.length <= 80, 'snippet 不应超过最大长度');
  });

  it('generateSnippet — 无匹配应返回截断内容', () => {
    const snippet = searcher.generateSnippet(
      'Short text.',
      'NotFound', 80
    );
    assert.equal(snippet, 'Short text.');
  });

  it('generateSnippet — 应高亮匹配词周围的上下文', () => {
    const content = 'A B C TypeScript D E F';
    const snippet = searcher.generateSnippet(content, 'TypeScript', 80);
    assert.ok(snippet.includes('TypeScript'), 'snippet 应包含匹配词');
    assert.ok(snippet.includes('...') || snippet === content,
      '长文本应截断并加省略号');
  });
});
