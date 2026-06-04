// =============================================================================
// TemplateEngine — TDD 测试
// Gate 3: 适配新的 renderStatus/renderSearch/renderNavigate API
// =============================================================================
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let TemplateEngine: typeof import('./template.js').TemplateEngine;

before(async () => {
  TemplateEngine = (await import('./template.js')).TemplateEngine;
});

describe('TemplateEngine', () => {
  // ===========================================================================
  // renderStatus — md_status 变更感知输出
  // ===========================================================================
  it('renderStatus — 应渲染变更批次概览', () => {
    const engine = new TemplateEngine();
    const data = {
      batchCount: 1,
      batches: [
        {
          index: 1,
          timeWindow: '14:32 ± 15min',
          fileCount: 2,
          files: [
            { fileName: 'intro.md', type: 'modified', path: 'docs/intro.md', lineRanges: '1-5', headingPath: 'Introduction', keywords_line: '关键词: welcome', related_line: '' },
            { fileName: 'guide.md', type: 'added', path: 'docs/guide.md', lineRanges: '1-10', headingPath: 'Guide', keywords_line: '', related_line: '' },
          ],
        },
      ],
      search_hint: '',
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '2026-01-01T00:00:00Z',
    };
    const result = engine.renderStatus(data);
    assert.ok(result.includes('1 批'));
    assert.ok(result.includes('批次 1'));
    assert.ok(result.includes('14:32 ± 15min'));
    assert.ok(result.includes('intro.md'));
    assert.ok(result.includes('modified'));
    assert.ok(result.includes('Introduction'));
    assert.ok(result.includes('【务必】'));
    assert.ok(result.includes('【不要】'));
    // stale=false 时不显示 staleness 行，agent 不需要无意义元数据
  });

  it('renderStatus — 空批次应渲染提示', () => {
    const engine = new TemplateEngine();
    const data = { batchCount: 0, batches: [], search_hint: '', stale: false, staleFileCount: 0, lastIndexedAt: '' };
    const result = engine.renderStatus(data);
    assert.ok(result.includes('暂无变更记录'));
    assert.ok(result.includes('【务必】'));
  });

  // ===========================================================================
  // renderSearch — md_search 全文搜索输出
  // ===========================================================================
  it('renderSearch — 应渲染搜索结果', () => {
    const engine = new TemplateEngine();
    const data = {
      query: 'hello',
      totalResults: 1,
      results: [
        { fileName: 'intro.md', filePath: 'docs/intro.md', headingPath: 'Introduction', snippet: 'Hello world', score: 1.5, lineRanges: '1-5', related_line: '' },
      ],
      navigate_hint: '',
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '2026-01-01T00:00:00Z',
    };
    const result = engine.renderSearch(data);
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('intro.md'));
    assert.ok(result.includes('Introduction'));
    assert.ok(result.includes('Hello world'));
    assert.ok(result.includes('1.5'));
    assert.ok(result.includes('【务必】'));
    assert.ok(result.includes('【不要】'));
    // stale=false 时不显示 staleness 行，agent 不需要无意义元数据
  });

  it('renderSearch — 无结果应渲染未找到', () => {
    const engine = new TemplateEngine();
    const data = { query: 'notfound', totalResults: 0, results: [], navigate_hint: '', stale: false, staleFileCount: 0, lastIndexedAt: '' };
    const result = engine.renderSearch(data);
    assert.ok(result.includes('notfound'));
    assert.ok(result.includes('未找到'));
  });

  // ===========================================================================
  // renderNavigate — md_navigate 链接关系探索输出
  // ===========================================================================
  it('renderNavigate — 应渲染导航结果', () => {
    const engine = new TemplateEngine();
    const data = {
      fileName: 'guide.md',
      sourcePath: 'docs/guide.md',
      topic: 'Installation',
      direction: 'outbound',
      depth: 1,
      totalLinks: 1,
      links: [
        { targetFileName: 'setup.md', targetPath: 'docs/setup.md', sourceLineRanges: '10-10', linkText: 'Setup guide', targetTopic: 'Setup', status: 'resolved' },
      ],
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '2026-01-01T00:00:00Z',
    };
    const result = engine.renderNavigate(data);
    assert.ok(result.includes('guide.md'));
    assert.ok(result.includes('Installation'));
    assert.ok(result.includes('出链'));
    assert.ok(result.includes('depth=1'));
    assert.ok(result.includes('setup.md'));
    assert.ok(result.includes('Setup guide'));
    assert.ok(result.includes('【务必】'));
    assert.ok(result.includes('【不要】'));
    // stale=false 时不显示 staleness 行，agent 不需要无意义元数据
  });

  it('renderNavigate — 无链接应渲染提示', () => {
    const engine = new TemplateEngine();
    const data = {
      fileName: 'guide.md',
      sourcePath: 'docs/guide.md',
      topic: 'Installation',
      direction: 'inbound',
      depth: 1,
      totalLinks: 0,
      links: [],
      stale: false,
      staleFileCount: 0,
      lastIndexedAt: '',
    };
    const result = engine.renderNavigate(data);
    assert.ok(result.includes('Navigation Results'));
  });
});
