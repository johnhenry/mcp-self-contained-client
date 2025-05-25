/**
 * @typedef {import('./types').ToolHandler} ToolHandler
 * @typedef {import('./types').ResourceHandler} ResourceHandler
 * @typedef {import('./types').PromptHandler} PromptHandler
 * @typedef {import('./types').ToolEntry} ToolEntry
 * @typedef {import('./types').ResourceEntry} ResourceEntry
 * @typedef {import('./types').PromptEntry} PromptEntry
 */

export class ResourceTemplate {
  /**
   * @param {string} pattern - URI pattern with placeholders like {key}
   */
  constructor(pattern) {
    this.pattern = pattern;
    this.keys = [...pattern.matchAll(/\{(.*?)\}/g)].map((m) => m[1]);
  }

  /**
   * Match a URI against the template and extract parameters
   * @param {URL} uri - The URI to match
   * @returns {Record<string, string> | null} - Extracted parameters or null if no match
   */
  match(uri) {
    const templateRegex = new RegExp(
      "^" +
        this.pattern.replace(/\{(.*?)\}/g, (_, key) => `(?<${key}>[^/]+)`) +
        "$"
    );
    const match = uri.href.match(templateRegex);
    return match?.groups ?? null;
  }

  /**
   * Fill the template with parameters to create a URL
   * @param {Record<string, string>} params - Parameters to fill the template
   * @returns {URL} - The filled URL
   */
  fill(params) {
    let filled = this.pattern;
    for (const key of this.keys) {
      filled = filled.replace(`{${key}}`, encodeURIComponent(params[key]));
    }
    return new URL(filled);
  }
}

export class SelfContainedClient {
  /**
   * @param {{ name: string; version: string }} options - Client configuration
   */
  constructor(options) {
    this.name = options.name;
    this.version = options.version;

    /** @type {Map<string, ToolEntry>} */
    this.tools = new Map();
    
    /** @type {Map<string, ResourceEntry>} */
    this.resources = new Map();
    
    /** @type {Map<string, PromptEntry>} */
    this.prompts = new Map();
  }

  /**
   * Register a tool
   * @param {string} name - Tool name
   * @param {import('zod').ZodSchema | ToolHandler} schema - Validation schema or handler
   * @param {ToolHandler} [handler] - Tool handler function
   */
  tool(name, schema, handler) {
    if (!handler) {
      handler = /** @type {ToolHandler} */ (schema);
      schema = undefined;
    }
    this.tools.set(name, { name, schema, handler });
  }

  /**
   * Register a prompt
   * @param {string} name - Prompt name
   * @param {import('zod').ZodSchema | PromptHandler} schema - Validation schema or handler
   * @param {PromptHandler} [handler] - Prompt handler function
   */
  prompt(name, schema, handler) {
    if (!handler) {
      handler = /** @type {PromptHandler} */ (schema);
      schema = undefined;
    }
    this.prompts.set(name, { name, schema, handler });
  }

  /**
   * Register a resource
   * @param {string} name - Resource name
   * @param {ResourceTemplate} uriTemplate - URI template for matching
   * @param {ResourceHandler} handler - Resource handler function
   * @param {import('zod').ZodSchema} [schema] - Optional validation schema
   */
  resource(name, uriTemplate, handler, schema) {
    this.resources.set(name, { name, uriTemplate, schema, handler });
  }

  // -- List Methods --

  /**
   * List all registered tools
   * @param {boolean} [detailed=false] - Whether to include schemas
   * @returns {string[] | Array<{name: string, schema?: import('zod').ZodSchema}>}
   */
  listTools(detailed = false) {
    return [...this.tools.values()].map((t) =>
      detailed ? { name: t.name, schema: t.schema } : t.name
    );
  }

  /**
   * List all registered prompts
   * @param {boolean} [detailed=false] - Whether to include schemas
   * @returns {string[] | Array<{name: string, schema?: import('zod').ZodSchema}>}
   */
  listPrompts(detailed = false) {
    return [...this.prompts.values()].map((p) =>
      detailed ? { name: p.name, schema: p.schema } : p.name
    );
  }

  /**
   * List all registered resources
   * @param {boolean} [detailed=false] - Whether to include schemas
   * @returns {string[] | Array<{name: string, schema?: import('zod').ZodSchema}>}
   */
  listResources(detailed = false) {
    return [...this.resources.values()].map((r) =>
      detailed ? { name: r.name, schema: r.schema } : r.name
    );
  }

  // -- Call Methods --

  /**
   * Call a tool with arguments
   * @param {{name: string, arguments: any}} params - Tool name and arguments
   * @returns {Promise<any>} - Tool execution result
   */
  async callTool({ name, arguments: args }) {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`Tool '${name}' not found`);
    if (entry.schema) args = entry.schema.parse(args);

    const result = await entry.handler(args);
    if (Symbol.asyncIterator in result) {
      const chunks = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }
      return { content: chunks };
    }
    return result;
  }

  /**
   * Read a resource by URI
   * @param {{uri: string}} params - Resource URI
   * @returns {Promise<{contents: Array<{uri: string, text: string}>}>}
   */
  async readResource({ uri }) {
    const url = new URL(uri);
    for (const entry of this.resources.values()) {
      const params = entry.uriTemplate.match(url);
      if (params) {
        if (entry.schema) entry.schema.parse(params);
        return await entry.handler(url, params);
      }
    }
    throw new Error(`No resource matches URI: ${uri}`);
  }

  /**
   * Get a prompt with arguments
   * @param {{name: string, arguments: any}} params - Prompt name and arguments
   * @returns {{messages: any[]}} - Generated prompt messages
   */
  getPrompt({ name, arguments: args }) {
    const entry = this.prompts.get(name);
    if (!entry) throw new Error(`Prompt '${name}' not found`);
    if (entry.schema) args = entry.schema.parse(args);
    return entry.handler(args);
  }

  // -- Delete Methods --

  /**
   * Delete a tool by name
   * @param {string} name - Tool name
   */
  deleteTool(name) {
    this.tools.delete(name);
  }

  /**
   * Delete a prompt by name
   * @param {string} name - Prompt name
   */
  deletePrompt(name) {
    this.prompts.delete(name);
  }

  /**
   * Delete a resource by name
   * @param {string} name - Resource name
   */
  deleteResource(name) {
    this.resources.delete(name);
  }

  /**
   * Delete all entries in a namespace
   * @param {string} prefix - Namespace prefix (e.g., "math" for "math:*")
   */
  deleteNamespace(prefix) {
    for (const map of [this.tools, this.resources, this.prompts]) {
      for (const key of map.keys()) {
        if (key.startsWith(prefix + ":")) {
          map.delete(key);
        }
      }
    }
  }

  // -- Describe Methods --

  /**
   * Get tool details
   * @param {string} name - Tool name
   * @returns {{name: string, schema?: import('zod').ZodSchema}}
   */
  describeTool(name) {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`Tool '${name}' not found`);
    return { name: entry.name, schema: entry.schema };
  }

  /**
   * Get prompt details
   * @param {string} name - Prompt name
   * @returns {{name: string, schema?: import('zod').ZodSchema}}
   */
  describePrompt(name) {
    const entry = this.prompts.get(name);
    if (!entry) throw new Error(`Prompt '${name}' not found`);
    return { name: entry.name, schema: entry.schema };
  }

  /**
   * Get resource details
   * @param {string} name - Resource name
   * @returns {{name: string, schema?: import('zod').ZodSchema}}
   */
  describeResource(name) {
    const entry = this.resources.get(name);
    if (!entry) throw new Error(`Resource '${name}' not found`);
    return { name: entry.name, schema: entry.schema };
  }
}