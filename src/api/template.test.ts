// =============================================================================
// TemplateSystem — TDD 测试
// =============================================================================
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let TemplateEngine: typeof import('./template.js').TemplateEngine;

before(async () => {
  TemplateEngine = (await import('./template.js')).TemplateEngine;
});

describe('TemplateEngine', () => {
  // ---------------------------------------------------------------------------
  // 变量插值
  // ---------------------------------------------------------------------------
  it('render — 应替换 {{变量名}} 为变量值', () => {
    const engine = new TemplateEngine();
    const result = engine.render('Hello {{name}}!', { name: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('render — 应替换多个不同的变量', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{greeting}}, {{name}}!', {
      greeting: 'Hi',
      name: 'Alice',
    });
    assert.equal(result, 'Hi, Alice!');
  });

  it('render — 未提供的变量应保留原样', () => {
    const engine = new TemplateEngine();
    const result = engine.render('Hello {{name}}!', {});
    assert.equal(result, 'Hello {{name}}!');
  });

  // ---------------------------------------------------------------------------
  // 条件块
  // ---------------------------------------------------------------------------
  it('render — {{#if var}} 条件为真时应渲染内容', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{#if show}}Visible{{/if}}', { show: true });
    assert.equal(result, 'Visible');
  });

  it('render — {{#if var}} 条件为假时应隐藏内容', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{#if show}}Hidden{{/if}}', { show: false });
    assert.equal(result, '');
  });

  it('render — {{#if var}} 变量不存在时应隐藏内容', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{#if missing}}Not shown{{/if}}', {});
    assert.equal(result, '');
  });

  it('render — {{#unless var}} 条件为假时应渲染内容', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{#unless hidden}}Visible{{/unless}}', { hidden: false });
    assert.equal(result, 'Visible');
  });

  it('render — {{#unless var}} 条件为真时应隐藏内容', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{#unless hidden}}Hidden{{/unless}}', { hidden: true });
    assert.equal(result, '');
  });

  // ---------------------------------------------------------------------------
  // _next 引导
  // ---------------------------------------------------------------------------
  it('render — {{_next label:query}} 应生成引导链接', () => {
    const engine = new TemplateEngine();
    const result = engine.render('{{_next "search docs":search keyword}}', {});
    assert.ok(result.includes('search docs'));
    assert.ok(result.includes('search'));
    assert.ok(result.includes('keyword'));
  });

  // ---------------------------------------------------------------------------
  // md_status 模板
  // ---------------------------------------------------------------------------
  it('renderTemplate — md_status 应渲染状态信息', () => {
    const engine = new TemplateEngine();
    const data = {
      totalFiles: 42,
      totalNodes: 350,
      totalEdges: 180,
      lastIndexedAt: '2026-01-15T10:00:00Z',
    };
    const result = engine.renderTemplate('md_status', data);
    assert.ok(result.includes('42'));
    assert.ok(result.includes('350'));
    assert.ok(result.includes('180'));
  });

  // ---------------------------------------------------------------------------
  // md_search 模板
  // ---------------------------------------------------------------------------
  it('renderTemplate — md_search 应渲染搜索结果', () => {
    const engine = new TemplateEngine();
    const data = {
      query: 'hello',
      totalResults: 5,
      results: [
        { filePath: 'docs/intro.md', headingPath: 'Introduction', snippet: 'Hello world', score: 1.5 },
      ],
    };
    const result = engine.renderTemplate('md_search', data);
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('docs/intro.md'));
    assert.ok(result.includes('Introduction'));
    assert.ok(result.includes('Hello world'));
  });

  // ---------------------------------------------------------------------------
  // md_navigate 模板
  // ---------------------------------------------------------------------------
  it('renderTemplate — md_navigate 应渲染导航结果', () => {
    const engine = new TemplateEngine();
    const data = {
      sourcePath: 'docs/guide.md',
      topic: 'Installation',
      direction: 'outbound',
      links: [
        { targetPath: 'docs/setup.md', linkText: 'Setup guide', status: 'resolved' },
      ],
    };
    const result = engine.renderTemplate('md_navigate', data);
    assert.ok(result.includes('docs/guide.md'));
    assert.ok(result.includes('Installation'));
    assert.ok(result.includes('docs/setup.md'));
    assert.ok(result.includes('Setup guide'));
  });

  // ===========================================================================
  // renderStatus — STATUS 模板
  // ===========================================================================
  it('renderStatus — 应渲染变更批次概览', () => {
    const engine = new TemplateEngine();
    const data = {
      batchCount: 1,
      batches: [
        {
          index: 1,
          timeWindow: '2026-06-04 14:00~15:00',
          fileCount: 2,
          files: [
            { fileName: 'intro.md', type: 'modified', path: 'docs/intro.md', lineRanges: '1-5', headingPath: 'Introduction', keywords_line: '关键词: welcome, hello', related_line: '关联: guide.md' },
            { fileName: 'guide.md', type: 'added', path: 'docs/guide.md', lineRanges: '1-10', headingPath: 'Guide', keywords_line: '', related_line: '' },
          ],
        },
      ],
      search_hint: '试试搜索关键词',
    };
    const result = engine.renderStatus(data);
    assert.ok(result.includes('1 批'));
    assert.ok(result.includes('批次 1'));
    assert.ok(result.includes('2026-06-04 14:00~15:00'));
    assert.ok(result.includes('intro.md'));
    assert.ok(result.includes('modified'));
    assert.ok(result.includes('行 1-5'));
    assert.ok(result.includes('Introduction'));
    assert.ok(result.includes('welcome'));
    assert.ok(result.includes('guide.md'));
    assert.ok(result.includes('试试搜索关键词'));
  });

  it('renderStatus — 空批次应渲染提示', () => {
    const engine = new TemplateEngine();
    const data = { batchCount: 0, batches: [], search_hint: '' };
    const result = engine.renderStatus(data);
    assert.ok(result.length > 0);
  });

  // ===========================================================================
  // renderSearch — SEARCH 模板
  // ===========================================================================
  it('renderSearch — 应渲染搜索结果', () => {
    const engine = new TemplateEngine();
    const data = {
      query: 'hello',
      totalResults: 2,
      results: [
        { fileName: 'intro.md', filePath: 'docs/intro.md', headingPath: 'Introduction', snippet: 'Hello world', score: 1.5, lineRanges: '1-5' },
      ],
    };
    const result = engine.renderSearch(data);
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('intro.md'));
    assert.ok(result.includes('Introduction'));
    assert.ok(result.includes('Hello world'));
  });

  it('renderSearch — 无结果应渲染未找到', () => {
    const engine = new TemplateEngine();
    const data = { query: 'notfound', totalResults: 0, results: [] };
    const result = engine.renderSearch(data);
    assert.ok(result.includes('notfound'));
    assert.ok(result.includes('未找到') || result.length > 0);
  });

  // ===========================================================================
  // renderNavigate — NAVIGATE 模板
  // ===========================================================================
  it('renderNavigate — 应渲染导航结果', () => {
    const engine = new TemplateEngine();
    const data = {
      sourcePath: 'docs/guide.md',
      topic: 'Installation',
      direction: 'outbound',
      totalLinks: 1,
      links: [
        { linkText: 'Setup guide', targetPath: 'docs/setup.md', status: 'resolved' },
      ],
    };
    const result = engine.renderNavigate(data);
    assert.ok(result.includes('docs/guide.md'));
    assert.ok(result.includes('Installation'));
    assert.ok(result.includes('outbound'));
    assert.ok(result.includes('Setup guide'));
    assert.ok(result.includes('docs/setup.md'));
  });

  it('renderNavigate — 无链接应渲染提示', () => {
    const engine = new TemplateEngine();
    const data = {
      sourcePath: 'docs/guide.md',
      topic: 'Installation',
      direction: 'inbound',
      totalLinks: 0,
      links: [],
    };
    const result = engine.renderNavigate(data);
    assert.ok(result.includes('暂无链接'));
  });
});
