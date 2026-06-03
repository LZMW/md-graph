// =============================================================================
// FileStore 单元测试
// TDD: RED → GREEN → REFACTOR
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileStore } from './filestore.js';

const TEST_DIR = path.join(os.tmpdir(), 'md-graph-filestore-test-' + Date.now());

describe('FileStore', () => {
  const store = new FileStore(TEST_DIR);

  before(() => {
    // 创建测试目录结构
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'a.md'), '# Hello\nWorld', 'utf-8');
    fs.writeFileSync(path.join(TEST_DIR, 'sub', 'b.md'), '## Sub', 'utf-8');
    fs.writeFileSync(path.join(TEST_DIR, 'sub', 'c.txt'), 'text only', 'utf-8');
    fs.writeFileSync(path.join(TEST_DIR, '.hidden', 'd.md'), 'hidden', 'utf-8');
    fs.writeFileSync(path.join(TEST_DIR, 'readme.md'), '# Readme\nContent here', 'utf-8');
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // read
  // ---------------------------------------------------------------------------
  it('read — 应读取 UTF-8 文件内容', async () => {
    const content = await store.read('a.md');
    assert.equal(content, '# Hello\nWorld');
  });

  it('read — 文件不存在应抛友好错误', async () => {
    await assert.rejects(
      () => store.read('nonexistent.md'),
      (err: Error) => {
        assert.ok(err.message.includes('nonexistent.md'));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------
  it('exists — 文件存在应返回 true', () => {
    assert.equal(store.exists('a.md'), true);
  });

  it('exists — 文件不存在应返回 false', () => {
    assert.equal(store.exists('nonexistent.md'), false);
  });

  // ---------------------------------------------------------------------------
  // stat
  // ---------------------------------------------------------------------------
  it('stat — 应返回 fs.Stats 对象', () => {
    const stats = store.stat('a.md');
    assert.ok(stats instanceof fs.Stats);
    assert.ok(stats.size > 0);
    assert.ok(stats.mtimeMs > 0);
  });

  it('stat — 文件不存在应抛异常', () => {
    assert.throws(() => store.stat('nonexistent.md'), /nonexistent\.md/);
  });

  // ---------------------------------------------------------------------------
  // hash
  // ---------------------------------------------------------------------------
  it('hash — 应返回 SHA-256 十六进制哈希', () => {
    const h = store.hash('test content');
    assert.equal(typeof h, 'string');
    assert.equal(h.length, 64); // SHA-256 hex length
    // 相同内容应返回相同哈希
    assert.equal(store.hash('test content'), store.hash('test content'));
    // 不同内容应返回不同哈希
    assert.notEqual(store.hash('test content'), store.hash('other content'));
  });

  // ---------------------------------------------------------------------------
  // getRelativePath
  // ---------------------------------------------------------------------------
  it('getRelativePath — 应将绝对路径转换为相对路径', () => {
    const absPath = path.join(TEST_DIR, 'sub', 'b.md');
    const rel = store.getRelativePath(absPath);
    // 使用正斜杠（统一格式）
    assert.ok(rel.endsWith('sub/b.md') || rel.endsWith('sub\\b.md'));
  });

  // ---------------------------------------------------------------------------
  // glob
  // ---------------------------------------------------------------------------
  it('glob — 应递归查找所有 .md 文件', async () => {
    const files = await store.glob('**/*.md');
    const relPaths = files.map(f => f.replace(/\\/g, '/'));
    assert.ok(relPaths.includes('a.md'));
    assert.ok(relPaths.includes('sub/b.md'));
    assert.ok(relPaths.includes('readme.md'));
  });

  it('glob — 应忽略隐藏目录（以 . 开头）中的文件', async () => {
    const files = await store.glob('**/*.md');
    const relPaths = files.map(f => f.replace(/\\/g, '/'));
    // .hidden/d.md 不应出现在结果中
    assert.ok(!relPaths.some(p => p.includes('.hidden')));
  });

  // ---------------------------------------------------------------------------
  // 安全：路径遍历防护
  // ---------------------------------------------------------------------------
  it('read — 路径遍历应抛错', async () => {
    await assert.rejects(
      () => store.read('../outside.md'),
      (err: Error) => {
        assert.ok(err.message.includes('越界'));
        return true;
      }
    );
  });

  it('read — 复杂路径遍历应抛错（../../）', async () => {
    await assert.rejects(
      () => store.read('sub/../../outside.md'),
      (err: Error) => {
        assert.ok(err.message.includes('越界'));
        return true;
      }
    );
  });

  it('stat — 路径遍历应抛错', () => {
    assert.throws(
      () => store.stat('../outside.md'),
      (err: Error) => {
        assert.ok(err.message.includes('越界'));
        return true;
      }
    );
  });

  it('exists — 路径遍历应抛错', () => {
    assert.throws(
      () => store.exists('../outside.md'),
      (err: Error) => {
        assert.ok(err.message.includes('越界'));
        return true;
      }
    );
  });
});
