// =============================================================================
// TemplateEngine — 自然语言模板引擎
// 支持变量插值、条件块、_next 引导
// 提供 md_status / md_search / md_navigate 三个预置模板
// + STATUS / SEARCH / NAVIGATE 三个静态模板
// =============================================================================

// ---------------------------------------------------------------------------
// 模板数据接口
// ---------------------------------------------------------------------------
export interface TemplateData {
  [key: string]: unknown;
}

export interface SearchResultItem {
  filePath: string;
  headingPath: string;
  snippet: string;
  score: number;
}

export interface SearchTemplateData extends TemplateData {
  query: string;
  totalResults: number;
  results: SearchResultItem[];
}

export interface StatusTemplateData extends TemplateData {
  totalFiles: number;
  totalNodes: number;
  totalEdges: number;
  lastIndexedAt: string;
}

export interface NavLinkItem {
  targetPath: string;
  linkText: string;
  status: string;
}

export interface NavigateTemplateData extends TemplateData {
  sourcePath: string;
  topic: string;
  direction: string;
  links: NavLinkItem[];
}

// ---------------------------------------------------------------------------
// 预定义模板
// ---------------------------------------------------------------------------
const PREDEFINED_TEMPLATES: Record<string, string> = {
  md_status: `## 知识库状态

当前索引了 **{{totalFiles}}** 个文件，包含 **{{totalNodes}}** 个节点和 **{{totalEdges}}** 条链接。

{{#if stale}}部分文件可能已过期，建议重新索引。{{/if}}
{{#unless stale}}索引状态良好，所有文件是最新的。{{/unless}}

最后索引时间: {{lastIndexedAt}}

{{_next "搜索文档":search 关键词}}
{{_next "查看文件关系":navigate 文件路径}}`,

  md_search: `## 搜索结果: "{{query}}"

找到 **{{totalResults}}** 条匹配结果：

{{#if results}}{{#each results}}
- {{headingPath}} ({{filePath}})
  \> {{snippet}}  [分数: {{score}}]
{{/each}}{{/if}}
{{#unless results}}未找到匹配内容。{{/unless}}

{{_next "换个关键词搜索":search 新关键词}}
{{_next "查看知识库状态":status}}`,

  md_navigate: `## 文件关系: {{sourcePath}}

**主题**: {{topic}}
**方向**: {{direction}}

{{#if links}}**链接列表**:
{{#each links}}
- [{{linkText}}]({{targetPath}}) [{{status}}]
{{/each}}{{/if}}
{{#unless links}}暂无链接信息。{{/unless}}

{{_next "搜索相关文档":search 关键词}}
{{_next "返回知识库状态":status}}`,
};

// =============================================================================
// TemplateEngine
// =============================================================================
export class TemplateEngine {
  private templates: Map<string, string>;

  constructor() {
    this.templates = new Map(Object.entries(PREDEFINED_TEMPLATES));
  }

  // =========================================================================
  // render — 渲染模板字符串
  // 支持: {{var}} 变量插值, {{#if var}}...{{/if}}, {{#unless var}}...{{/unless}}
  //       {{#each items}}...{{/each}}, {{_next "label":query}}
  // =========================================================================
  render(template: string, data: TemplateData): string {
    let result = this.renderNextTags(template);
    result = this.renderEachBlocks(result, data);
    result = this.renderConditionalBlocks(result, data);
    result = this.renderVariables(result, data);
    return result;
  }

  // =========================================================================
  // renderTemplate — 使用预定义模板渲染
  // =========================================================================
  renderTemplate(templateName: string, data: TemplateData): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`未知模板: ${templateName}`);
    }
    return this.render(template, data);
  }

  // =========================================================================
  // registerTemplate — 注册自定义模板
  // =========================================================================
  registerTemplate(name: string, template: string): void {
    this.templates.set(name, template);
  }

  // =========================================================================
  // 内部渲染方法
  // =========================================================================

  /** 渲染 {{_next "label":query}} 标签为引导提示 */
  private renderNextTags(template: string): string {
    return template.replace(
      /\{\{_next\s+"([^"]+)"\s*:\s*([^}]+)\}\}/g,
      (_, label: string, suggestion: string) => {
        return `\n> 您可以继续查询: **${label}** (\`${suggestion.trim()}\`)\n`;
      },
    );
  }

  /** 渲染 {{#each items}}...{{/each}} 块 */
  private renderEachBlocks(template: string, data: TemplateData): string {
    const blockRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    return template.replace(blockRegex, (_, key: string, content: string) => {
      const items = data[key];
      if (!Array.isArray(items) || items.length === 0) return '';
      return items.map((item: Record<string, unknown>) => {
        return this.renderVariables(content, item as TemplateData);
      }).join('\n');
    });
  }

  /** 渲染 {{#if var}}...{{/if}} 和 {{#unless var}}...{{/unless}} 块 */
  private renderConditionalBlocks(template: string, data: TemplateData): string {
    // {{#unless var}}...{{/unless}}
    let result = template.replace(
      /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (_, key: string, content: string) => {
        const val = data[key];
        return (!val) ? content : '';
      },
    );

    // {{#if var}}...{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key: string, content: string) => {
        const val = data[key];
        return (val) ? content : '';
      },
    );

    return result;
  }

  /** 渲染 {{var}} 变量插值 */
  private renderVariables(template: string, data: TemplateData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = data[key];
      if (val === undefined || val === null) return `{{${key}}}`;
      return String(val);
    });
  }

  // =========================================================================
  // renderStatus — 使用 STATUS 模板渲染变更批次
  // =========================================================================
  renderStatus(data: Record<string, unknown>): string {
    const batches = (data['batches'] as Array<Record<string, unknown>>) ?? [];
    const batchCount = data['batchCount'] ?? 0;
    const searchHint = (data['search_hint'] as string) ?? '';

    let result = `## 最近变更 (${batchCount} 批)\n\n`;

    if (batches.length > 0) {
      const batchParts: string[] = [];
      for (const batch of batches) {
        const files = (batch['files'] as Array<Record<string, unknown>>) ?? [];
        const idx = batch['index'];
        const tw = batch['timeWindow'] as string;
        const fc = batch['fileCount'] ?? files.length;

        const fileLines = files.map((f) => {
          const fn = f['fileName'] as string ?? '';
          const tp = f['type'] as string ?? '';
          const p = f['path'] as string ?? '';
          const lr = f['lineRanges'] as string ?? '';
          const hp = f['headingPath'] as string ?? '';
          const kl = f['keywords_line'] as string ?? '';
          const rl = f['related_line'] as string ?? '';
          return `- **${fn}** (${tp}, ${p})\n  行 ${lr} · ${hp}\n  ${kl}\n  ${rl}`;
        }).join('\n');

        batchParts.push(
          `### 批次 ${idx}: ${tw} — ${fc} 个文件变更\n\n${fileLines}`,
        );
      }
      result += batchParts.join('\n') + '\n\n';
    }

    result += `【务必】使用 Read 工具读取上方文件路径和行号，如有必要直接查看文件全部内容。${searchHint}\n`;
    result += '【不要】假设以上文件列表完整——未出现在变更列表中的文件可能仍包含相关内容。';
    return result;
  }

  // =========================================================================
  // renderSearch — 使用 SEARCH 模板渲染搜索结果
  // =========================================================================
  renderSearch(data: Record<string, unknown>): string {
    const query = (data['query'] as string) ?? '';
    const totalResults = data['totalResults'] ?? 0;
    const results = (data['results'] as Array<Record<string, unknown>>) ?? [];
    const searchHint = (data['search_hint'] as string) ?? '';

    let result = `## 搜索结果: "${query}"\n\n找到 **${totalResults}** 条匹配结果：\n\n`;

    if (results.length > 0) {
      for (const r of results) {
        result += `- **${r['fileName'] ?? ''}** (${r['filePath'] ?? ''})\n`;
        result += `  行 ${r['lineRanges'] ?? ''} · ${r['headingPath'] ?? ''}\n`;
        result += `  > ${r['snippet'] ?? ''}\n`;
      }
    } else {
      result += '未找到匹配内容。\n';
    }

    result += `\n${searchHint}`;
    return result;
  }

  // =========================================================================
  // renderNavigate — 使用 NAVIGATE 模板渲染导航结果
  // =========================================================================
  renderNavigate(data: Record<string, unknown>): string {
    const sourcePath = (data['sourcePath'] as string) ?? '';
    const topic = (data['topic'] as string) ?? '';
    const direction = (data['direction'] as string) ?? '';
    const totalLinks = data['totalLinks'] ?? 0;
    const links = (data['links'] as Array<Record<string, unknown>>) ?? [];
    const searchHint = (data['search_hint'] as string) ?? '';

    let result = `## 文件关系: ${sourcePath}\n\n`;
    result += `**主题**: ${topic}\n`;
    result += `**方向**: ${direction}\n`;
    result += `**链接数**: ${totalLinks}\n\n`;

    if (links.length > 0) {
      for (const l of links) {
        result += `- [${l['linkText'] ?? ''}](${l['targetPath'] ?? ''}) [${l['status'] ?? ''}]\n`;
      }
    } else {
      result += '暂无链接信息。\n';
    }

    result += `\n${searchHint}`;
    return result;
  }
}
