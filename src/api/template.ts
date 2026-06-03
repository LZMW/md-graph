// =============================================================================
// TemplateEngine — 自然语言模板引擎
// 支持变量插值、条件块、_next 引导
// 提供 md_status / md_search / md_navigate 三个预置模板
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
}
