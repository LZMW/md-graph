// =============================================================================
// ParserRegistry + DocumentParser 接口单元测试
// TDD: RED → GREEN → REFACTOR
// =============================================================================
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentParser, DocumentFormat } from './base-parser.js';
import { ParserRegistry } from './index.js';

// ---------------------------------------------------------------------------
// Mock 解析器 — 用于测试 DocumentParser 接口
// ---------------------------------------------------------------------------
class MockParser implements DocumentParser {
  supportedFormat: DocumentFormat = 'md';
  readonly unsuitableFor?: string[] = ['测试用 mock 解析器，不支持实际解析'];

  parse(_content: string, _filePath?: string) {
    return {
      nodes: [],
      edges: [],
      metadata: { headings: [], codeBlocks: [] },
      contentHash: 'mock-hash',
    };
  }
}

// ===========================================================================
// DocumentParser 接口
// ===========================================================================
describe('DocumentParser 接口', () => {
  it('MockParser 应实现 DocumentParser 接口', () => {
    const parser: DocumentParser = new MockParser();
    assert.equal(parser.supportedFormat, 'md');
    assert.ok(Array.isArray(parser.unsuitableFor));
    assert.equal(parser.unsuitableFor!.length, 1);
  });

  it('parse 应返回 ParsedDocument 结构', () => {
    const parser = new MockParser();
    const result = parser.parse('# Hello', 'test.md');
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
    assert.ok(result.metadata);
    assert.ok(Array.isArray(result.metadata.headings));
    assert.ok(Array.isArray(result.metadata.codeBlocks));
    assert.equal(typeof result.contentHash, 'string');
  });

  it('should accept empty content', () => {
    const parser = new MockParser();
    const result = parser.parse('', 'empty.md');
    assert.equal(result.nodes.length, 0);
    assert.equal(result.edges.length, 0);
  });

  it('should accept undefined filePath', () => {
    const parser = new MockParser();
    const result = parser.parse('# Hello');
    assert.equal(result.contentHash, 'mock-hash');
  });
});

// ===========================================================================
// ParserRegistry
// ===========================================================================
describe('ParserRegistry', () => {
  // 每个测试前清空注册表
  beforeEach(() => {
    ParserRegistry.clear();
  });

  it('register — 应注册解析器到指定格式', () => {
    const parser = new MockParser();
    ParserRegistry.register('md', parser);
    const retrieved = ParserRegistry.get('md');
    assert.ok(retrieved);
    assert.equal(retrieved, parser);
  });

  it('get — 未注册格式应返回 undefined', () => {
    const retrieved = ParserRegistry.get('mdx');
    assert.equal(retrieved, undefined);
  });

  it('getExtensions — 应返回所有已注册格式列表', () => {
    const mdParser = new MockParser();
    // 创建另一个 mock 用于 mdx
    const mdxParser: DocumentParser = {
      supportedFormat: 'mdx',
      parse: () => ({
        nodes: [], edges: [], metadata: { headings: [], codeBlocks: [] }, contentHash: 'mock',
      }),
    };

    ParserRegistry.register('md', mdParser);
    ParserRegistry.register('mdx', mdxParser);

    const exts = ParserRegistry.getExtensions();
    assert.equal(exts.length, 2);
    assert.ok(exts.includes('md'));
    assert.ok(exts.includes('mdx'));
  });

  it('getExtensions — 空注册表应返回空数组', () => {
    const exts = ParserRegistry.getExtensions();
    assert.deepEqual(exts, []);
  });

  it('register — 后注册应覆盖先注册', () => {
    const parser1 = new MockParser();
    const parser2: DocumentParser = {
      supportedFormat: 'md',
      parse: () => ({
        nodes: [], edges: [], metadata: { headings: [], codeBlocks: [] }, contentHash: 'parser2',
      }),
    };

    ParserRegistry.register('md', parser1);
    ParserRegistry.register('md', parser2);
    const retrieved = ParserRegistry.get('md');
    assert.equal(retrieved, parser2);
  });
});
