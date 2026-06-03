// =============================================================================
// Entry Point — TDD 测试
// =============================================================================
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

let index: typeof import('./index.js');

before(async () => {
  index = await import('./index.js');
});

describe('Entry Point (index.ts)', () => {
  it('应导出 MdGraph 类', () => {
    assert.ok(index.MdGraph);
    assert.equal(typeof index.MdGraph, 'function');
  });

  it('应导出 createCli 函数', () => {
    assert.ok(index.createCli);
    assert.equal(typeof index.createCli, 'function');
  });

  it('应导出 runCli 函数', () => {
    assert.ok(index.runCli);
    assert.equal(typeof index.runCli, 'function');
  });

  it('应导出 main 函数', () => {
    assert.ok(index.main);
    assert.equal(typeof index.main, 'function');
  });

  it('MdGraph 应能创建实例', () => {
    const tmpDir = path.join(os.tmpdir(), 'md-graph-entry-test');
    const graph = new index.MdGraph(tmpDir, {
      dbPath: ':memory:',
    });
    assert.ok(graph instanceof index.MdGraph);
    assert.equal(typeof graph.status, 'function');
    assert.equal(typeof graph.search, 'function');
    assert.equal(typeof graph.navigate, 'function');
  });
});
