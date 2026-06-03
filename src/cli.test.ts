// =============================================================================
// CLI — TDD 测试
// 每个测试使用独立的临时目录以避免相互干扰
// =============================================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let cmdInit: typeof import('./cli.js').cmdInit;
let cmdStatus: typeof import('./cli.js').cmdStatus;
let cmdUninstall: typeof import('./cli.js').cmdUninstall;
let createCli: typeof import('./cli.js').createCli;

before(async () => {
  cmdInit = (await import('./cli.js')).cmdInit;
  cmdStatus = (await import('./cli.js')).cmdStatus;
  cmdUninstall = (await import('./cli.js')).cmdUninstall;
  createCli = (await import('./cli.js')).createCli;
});

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(dir, 'test.md'), '# Hello\n\nTest file.\n\n[link](other.md)');
  fs.writeFileSync(path.join(dir, 'other.md'), '# Other\n\nAnother file.');
  return dir;
}

function cleanupDir(dir: string): void {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      break;
    } catch {
      // 等待文件锁释放
    }
  }
}

describe('CLI', () => {
  it('createCli — 应返回 Commander 程序实例', () => {
    const program = createCli();
    assert.ok(program);
    assert.equal(typeof program.parseAsync, 'function');
  });

  it('cmdInit — 应初始化新仓库', async () => {
    const tmpDir = createTempDir('md-graph-cli-init-');
    try {
      const result = await cmdInit(tmpDir);
      assert.ok(result.success);
      const storageDir = path.join(tmpDir, '.md-graph');
      assert.ok(fs.existsSync(storageDir));
      assert.ok(fs.existsSync(path.join(storageDir, 'index.db')));
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('cmdInit — 重复初始化应返回失败', async () => {
    const tmpDir = createTempDir('md-graph-cli-reinit-');
    try {
      await cmdInit(tmpDir);
      const result = await cmdInit(tmpDir);
      assert.equal(result.success, false);
      const msg = result as { message?: string };
      assert.ok(msg.message?.includes('already exists'));
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('cmdStatus — 初始化后应返回状态', async () => {
    const tmpDir = createTempDir('md-graph-cli-status-');
    try {
      await cmdInit(tmpDir);
      const result = await cmdStatus(tmpDir);
      assert.ok(result.success);
      assert.ok(typeof result.totalFiles === 'number');
      assert.ok(typeof result.totalNodes === 'number');
      assert.ok(typeof result.totalEdges === 'number');
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('cmdStatus — 未初始化应返回失败', async () => {
    const tmpDir = createTempDir('md-graph-cli-nostatus-');
    try {
      const result = await cmdStatus(tmpDir);
      assert.equal(result.success, false);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('cmdUninstall — 应删除存储目录', async () => {
    const tmpDir = createTempDir('md-graph-cli-uninstall-');
    try {
      await cmdInit(tmpDir);
      const result = await cmdUninstall(tmpDir);
      assert.ok(result.success);
      const storageDir = path.join(tmpDir, '.md-graph');
      assert.ok(!fs.existsSync(storageDir));
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('cmdUninstall — 未初始化时应返回失败', async () => {
    const tmpDir = createTempDir('md-graph-cli-nouninst-');
    try {
      const result = await cmdUninstall(tmpDir);
      assert.equal(result.success, false);
    } finally {
      cleanupDir(tmpDir);
    }
  });
});
