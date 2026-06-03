// =============================================================================
// MarkdownParser 单元测试
// TDD: RED → GREEN → REFACTOR
// 覆盖 7 类节点、链接提取、parent_id 树、headingPath、contentHash
// =============================================================================
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownParser } from './md-parser.js';
import type { DocNode, ExtractedLink } from '../../types.js';

// ===========================================================================
// 辅助函数
// ===========================================================================
function findNodes(nodes: DocNode[], type: string): DocNode[] {
  return nodes.filter(n => n.type === type);
}

function findNode(nodes: DocNode[], type: string, idx = 0): DocNode {
  const found = findNodes(nodes, type);
  assert.ok(found.length > idx, `Expected at least ${idx + 1} node of type ${type}, got ${found.length}`);
  return found[idx];
}

// ===========================================================================
// 测试
// ===========================================================================
describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  before(() => {
    parser = new MarkdownParser();
  });

  // -----------------------------------------------------------------------
  // Step 1: 基础结构和文档根节点
  // -----------------------------------------------------------------------
  it('should have supportedFormat = md', () => {
    assert.equal(parser.supportedFormat, 'md');
  });

  it('should declare unsuitableFor', () => {
    assert.ok(Array.isArray(parser.unsuitableFor));
    assert.ok(parser.unsuitableFor!.length > 0);
  });

  it('should produce a document root node', () => {
    const result = parser.parse('# Hello', 'test.md');
    const docs = findNodes(result.nodes, 'document');
    assert.equal(docs.length, 1);
    assert.equal(docs[0].searchable, false);
    assert.equal(docs[0].filePath, 'test.md');
  });

  it('should handle empty content', () => {
    const result = parser.parse('', 'empty.md');
    const docs = findNodes(result.nodes, 'document');
    assert.equal(docs.length, 1);
    // 除 document 外无其他节点
    assert.equal(result.nodes.length, 1);
  });

  // -----------------------------------------------------------------------
  // Step 2: Heading 节点映射
  // -----------------------------------------------------------------------
  it('should parse h1 heading', () => {
    const result = parser.parse('# Title\n\nSome text', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings.length, 1);
    assert.equal(headings[0].headingLevel, 1);
    assert.equal(headings[0].content, 'Title');
    assert.equal(headings[0].searchable, true);
  });

  it('should parse h2 heading', () => {
    const result = parser.parse('## Section', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings.length, 1);
    assert.equal(headings[0].headingLevel, 2);
    assert.equal(headings[0].content, 'Section');
  });

  it('should parse nested headings with correct headingPath', () => {
    const result = parser.parse('# Title\n\n## Sub\n\n### Detail', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings.length, 3);

    // headingPath 追踪
    assert.equal(headings[0].headingPath, 'Title');
    assert.equal(headings[1].headingPath, 'Title > Sub');
    assert.equal(headings[2].headingPath, 'Title > Sub > Detail');
  });

  it('should handle heading level reset', () => {
    const result = parser.parse('# A\n\n## B\n\n# C\n\n## D', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings.length, 4);
    // C 重置了层级
    assert.equal(headings[2].headingPath, 'C');
    assert.equal(headings[3].headingPath, 'C > D');
  });

  // -----------------------------------------------------------------------
  // Step 3: Paragraph 节点映射
  // -----------------------------------------------------------------------
  it('should parse paragraph with content', () => {
    const result = parser.parse('# Title\n\nHello world', 'test.md');
    const paragraphs = findNodes(result.nodes, 'paragraph');
    assert.equal(paragraphs.length, 1);
    assert.equal(paragraphs[0].content, 'Hello world');
    assert.equal(paragraphs[0].searchable, true);
  });

  it('should not include heading text as paragraph', () => {
    const result = parser.parse('# Title', 'test.md');
    const paragraphs = findNodes(result.nodes, 'paragraph');
    assert.equal(paragraphs.length, 0);
  });

  // -----------------------------------------------------------------------
  // Step 4: 其他节点类型
  // -----------------------------------------------------------------------
  it('should parse list_item', () => {
    const result = parser.parse('- item one\n- item two', 'test.md');
    const items = findNodes(result.nodes, 'list_item');
    assert.equal(items.length, 2);
    assert.equal(items[0].searchable, true);
    assert.ok(items[0].content);
  });

  it('should parse code_block with language', () => {
    const result = parser.parse('```typescript\nconst x = 1;\n```', 'test.md');
    const blocks = findNodes(result.nodes, 'code_block');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].searchable, true);
    assert.ok(blocks[0].content);
    // code block 的 content 应包含代码文本
    assert.ok(blocks[0].content!.includes('const x = 1'));
  });

  it('should parse blockquote', () => {
    const result = parser.parse('> A wise quote', 'test.md');
    const quotes = findNodes(result.nodes, 'blockquote');
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].searchable, false);
  });

  it('should parse table_row', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const result = parser.parse(md, 'test.md');
    const rows = findNodes(result.nodes, 'table_row');
    // 表头一行 + 数据一行 = 2 行
    assert.equal(rows.length, 2);
    assert.equal(rows[0].searchable, false);
  });

  // -----------------------------------------------------------------------
  // Step 5: 链接提取
  // -----------------------------------------------------------------------
  it('should extract internal links', () => {
    const result = parser.parse('[link](./doc.md)', 'test.md');
    const links = result.edges;
    assert.equal(links.length, 1);
    assert.equal(links[0].rawHref, './doc.md');
    assert.equal(links[0].linkText, 'link');
    assert.equal(links[0].type, 'internal');
  });

  it('should extract external links', () => {
    const result = parser.parse('[Google](https://google.com)', 'test.md');
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].type, 'external');
    assert.equal(result.edges[0].rawHref, 'https://google.com');
  });

  it('should extract anchor links', () => {
    const result = parser.parse('[锚点](#install)', 'test.md');
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].type, 'anchor');
    assert.equal(result.edges[0].rawHref, '#install');
  });

  it('should extract multiple links from one paragraph', () => {
    const result = parser.parse('See [A](a.md) and [B](https://b.com).', 'test.md');
    assert.equal(result.edges.length, 2);
    assert.equal(result.edges[0].type, 'internal');
    assert.equal(result.edges[1].type, 'external');
  });

  // -----------------------------------------------------------------------
  // Step 6-7: parent_id 层级分配
  // -----------------------------------------------------------------------
  it('should assign parent_id to nodes under heading', () => {
    const result = parser.parse('# A\n\np1\n\n## B\n\np2', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    const paragraphs = findNodes(result.nodes, 'paragraph');

    // document 节点是根
    const doc = findNode(result.nodes, 'document');

    // heading A 的 parentId 指向 document
    assert.equal(headings[0].parentId, doc.id);

    // heading B 的 parentId 指向 heading A
    assert.equal(headings[1].parentId, headings[0].id);

    // p1 在 heading A 下
    assert.equal(paragraphs[0].parentId, headings[0].id);

    // p2 在 heading B 下
    assert.equal(paragraphs[1].parentId, headings[1].id);
  });

  it('should increment ordinal within same parent', () => {
    const result = parser.parse('- a\n- b\n- c', 'test.md');
    const items = findNodes(result.nodes, 'list_item');
    assert.equal(items[0].ordinal, 1);
    assert.equal(items[1].ordinal, 2);
    assert.equal(items[2].ordinal, 3);
  });

  // -----------------------------------------------------------------------
  // Step 8: contentHash
  // -----------------------------------------------------------------------
  it('should produce same contentHash for same content', () => {
    const r1 = parser.parse('# Hello\nWorld', 'a.md');
    const r2 = parser.parse('# Hello\nWorld', 'b.md');
    assert.equal(r1.contentHash, r2.contentHash);
  });

  it('should produce different contentHash for different content', () => {
    const r1 = parser.parse('# Hello', 'a.md');
    const r2 = parser.parse('# World', 'b.md');
    assert.notEqual(r1.contentHash, r2.contentHash);
  });

  // -----------------------------------------------------------------------
  // 通盘测试
  // -----------------------------------------------------------------------
  it('should parse all 7 node types in one document', () => {
    const md = [
      '# Full Test',
      '',
      'A paragraph.',
      '',
      '- list item 1',
      '- list item 2',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '> A blockquote',
      '',
      '| H1 | H2 |',
      '| -- | -- |',
      '| D1 | D2 |',
    ].join('\n');

    const result = parser.parse(md, 'full.md');

    // 检查 7 种节点类型都存在
    const types = new Set(result.nodes.map(n => n.type));
    assert.ok(types.has('document'), 'should have document');
    assert.ok(types.has('heading'), 'should have heading');
    assert.ok(types.has('paragraph'), 'should have paragraph');
    assert.ok(types.has('list_item'), 'should have list_item');
    assert.ok(types.has('code_block'), 'should have code_block');
    assert.ok(types.has('blockquote'), 'should have blockquote');
    assert.ok(types.has('table_row'), 'should have table_row');
  });

  it('should extract links from complex markdown', () => {
    const md = [
      '# Links',
      '',
      'See [docs](./docs.md) for details.',
      '',
      'Visit [Google](https://google.com) or [local](#section).',
    ].join('\n');

    const result = parser.parse(md, 'links.md');
    assert.equal(result.edges.length, 3);

    const types = result.edges.map(e => e.type);
    assert.ok(types.includes('internal'));
    assert.ok(types.includes('external'));
    assert.ok(types.includes('anchor'));
  });

  it('should set nodes filePath from parameter', () => {
    const result = parser.parse('# Test', 'my/custom/path.md');
    for (const node of result.nodes) {
      assert.equal(node.filePath, 'my/custom/path.md');
    }
  });

  it('should extract heading from link text heading', () => {
    const result = parser.parse('# Introduction\n\n## Getting Started\n\nContent here.', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings[0].content, 'Introduction');
    assert.equal(headings[1].content, 'Getting Started');
  });

  it('should handle heading with inline formatting', () => {
    const result = parser.parse('# **Bold Title** and *italic*', 'test.md');
    const headings = findNodes(result.nodes, 'heading');
    assert.equal(headings.length, 1);
    // 内容应提取纯文本
    assert.ok(headings[0].content);
    assert.ok(headings[0].content!.includes('Bold Title'));
  });
});
