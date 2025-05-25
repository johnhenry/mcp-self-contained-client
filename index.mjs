/**
 * @typedef {import('./types').ToolHandler} ToolHandler
 * @typedef {import('./types').ResourceHandler} ResourceHandler
 * @typedef {import('./types').PromptHandler} PromptHandler
 * @typedef {import('./types').ToolEntry} ToolEntry
 * @typedef {import('./types').ResourceEntry} ResourceEntry
 * @typedef {import('./types').PromptEntry} PromptEntry
 * @typedef {import('./types').Tool} Tool
 * @typedef {import('./types').Resource} Resource
 * @typedef {import('./types').Prompt} Prompt
 * @typedef {import('./types').PromptArgument} PromptArgument
 * @typedef {import('./types').GetPromptResult} GetPromptResult
 * @typedef {import('./types').ReadResourceResult} ReadResourceResult
 * @typedef {import('./types').ToolResult} ToolResult
 */

export class ResourceTemplate {
  /**
   * @param {string} pattern - URI pattern with placeholders like {key}
   * @param {{ name?: string; description?: string; mimeType?: string }} [options] - Template options
   */
  constructor(pattern, options = {}) {
    this.pattern = pattern;
    this.keys = [...pattern.matchAll(/\{(.*?)\}/g)].map((m) => m[1]);
    this.name = options.name;
    this.description = options.description;
    this.mimeType = options.mimeType;
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
   * @overload
   * @param {string} name - Tool name
   * @param {ToolHandler} handler - Tool handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Tool name
   * @param {{ description?: string; inputSchema?: Record<string, any> }} options - Tool options
   * @param {ToolHandler} handler - Tool handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Tool name
   * @param {import('zod').ZodSchema} schema - Validation schema
   * @param {ToolHandler} handler - Tool handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Tool name
   * @param {{ description?: string; schema?: import('zod').ZodSchema }} options - Tool options with schema
   * @param {ToolHandler} handler - Tool handler function
   * @returns {void}
   */
  tool(name, optionsOrSchemaOrHandler, handler) {
    /** @type {ToolEntry} */
    let entry = { name, handler: null };

    if (typeof optionsOrSchemaOrHandler === 'function') {
      // tool(name, handler)
      entry.handler = optionsOrSchemaOrHandler;
    } else if (handler) {
      // tool(name, options/schema, handler)
      entry.handler = handler;
      if (optionsOrSchemaOrHandler.parse) {
        // It's a Zod schema
        entry.schema = optionsOrSchemaOrHandler;
      } else {
        // It's options
        entry.description = optionsOrSchemaOrHandler.description;
        entry.schema = optionsOrSchemaOrHandler.schema;
      }
    }

    this.tools.set(name, entry);
  }

  /**
   * Register a prompt
   * @overload
   * @param {string} name - Prompt name
   * @param {PromptHandler} handler - Prompt handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Prompt name
   * @param {{ description?: string; arguments?: PromptArgument[] }} options - Prompt options
   * @param {PromptHandler} handler - Prompt handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Prompt name
   * @param {import('zod').ZodSchema} schema - Validation schema
   * @param {PromptHandler} handler - Prompt handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Prompt name
   * @param {{ description?: string; schema?: import('zod').ZodSchema; arguments?: PromptArgument[] }} options - Prompt options with schema
   * @param {PromptHandler} handler - Prompt handler function
   * @returns {void}
   */
  prompt(name, optionsOrSchemaOrHandler, handler) {
    /** @type {PromptEntry} */
    let entry = { name, handler: null };

    if (typeof optionsOrSchemaOrHandler === 'function') {
      // prompt(name, handler)
      entry.handler = optionsOrSchemaOrHandler;
    } else if (handler) {
      // prompt(name, options/schema, handler)
      entry.handler = handler;
      if (optionsOrSchemaOrHandler.parse) {
        // It's a Zod schema
        entry.schema = optionsOrSchemaOrHandler;
      } else {
        // It's options
        entry.description = optionsOrSchemaOrHandler.description;
        entry.schema = optionsOrSchemaOrHandler.schema;
        entry.arguments = optionsOrSchemaOrHandler.arguments;
      }
    }

    this.prompts.set(name, entry);
  }

  /**
   * Register a resource
   * @overload
   * @param {string} name - Resource name
   * @param {ResourceTemplate} uriTemplate - URI template for matching
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {ResourceTemplate} uriTemplate - URI template for matching
   * @param {{ description?: string; mimeType?: string }} options - Resource options
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {ResourceTemplate} uriTemplate - URI template for matching
   * @param {import('zod').ZodSchema} schema - Validation schema
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {ResourceTemplate} uriTemplate - URI template for matching
   * @param {{ description?: string; mimeType?: string; schema?: import('zod').ZodSchema }} options - Resource options with schema
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  resource(name, uriTemplate, optionsOrSchemaOrHandler, handler) {
    /** @type {ResourceEntry} */
    let entry = { name, uriTemplate, handler: null };

    if (typeof optionsOrSchemaOrHandler === 'function') {
      // resource(name, template, handler)
      entry.handler = optionsOrSchemaOrHandler;
    } else if (handler) {
      // resource(name, template, options/schema, handler)
      entry.handler = handler;
      if (optionsOrSchemaOrHandler.parse) {
        // It's a Zod schema
        entry.schema = optionsOrSchemaOrHandler;
      } else {
        // It's options
        entry.description = optionsOrSchemaOrHandler.description;
        entry.mimeType = optionsOrSchemaOrHandler.mimeType;
        entry.schema = optionsOrSchemaOrHandler.schema;
      }
    }

    this.resources.set(name, entry);
  }

  // -- List Methods --

  /**
   * List all registered tools
   * @returns {Promise<{ tools: Tool[] }>}
   */
  async listTools() {
    const tools = [...this.tools.values()].map((t) => {
      /** @type {Tool} */
      const tool = {
        name: t.name
      };
      if (t.description) tool.description = t.description;
      if (t.schema) {
        // Convert Zod schema to JSON schema if possible
        tool.inputSchema = t.schema._def || {};
      }
      return tool;
    });
    return { tools };
  }

  /**
   * List all registered prompts
   * @returns {Promise<{ prompts: Prompt[] }>}
   */
  async listPrompts() {
    const prompts = [...this.prompts.values()].map((p) => {
      /** @type {Prompt} */
      const prompt = {
        name: p.name
      };
      if (p.description) prompt.description = p.description;
      if (p.arguments) prompt.arguments = p.arguments;
      return prompt;
    });
    return { prompts };
  }

  /**
   * List all registered resources
   * @returns {Promise<{ resources: Resource[] }>}
   */
  async listResources() {
    const resources = [];
    for (const entry of this.resources.values()) {
      // For each resource, we could generate example URIs
      /** @type {Resource} */
      const resource = {
        uri: entry.uriTemplate.pattern,
        name: entry.name
      };
      if (entry.description) resource.description = entry.description;
      if (entry.mimeType) resource.mimeType = entry.mimeType;
      resources.push(resource);
    }
    return { resources };
  }

  /**
   * List all resource templates
   * @returns {Promise<{ resourceTemplates: Array<{ uriTemplate: string; name: string; description?: string; mimeType?: string }> }>}
   */
  async listResourceTemplates() {
    const resourceTemplates = [...this.resources.values()].map((r) => {
      const template = {
        uriTemplate: r.uriTemplate.pattern,
        name: r.name
      };
      if (r.description) template.description = r.description;
      if (r.mimeType) template.mimeType = r.mimeType;
      return template;
    });
    return { resourceTemplates };
  }

  // -- Call Methods --

  /**
   * Call a tool with arguments
   * @param {{ name: string; arguments?: any }} params - Tool name and arguments
   * @returns {Promise<ToolResult>} - Tool execution result
   */
  async callTool({ name, arguments: args = {} }) {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`Tool '${name}' not found`);
    
    try {
      // Validate arguments if schema exists
      if (entry.schema) {
        args = entry.schema.parse(args);
      }

      const result = await entry.handler(args);
      
      // Handle async iterators
      if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
        const content = [];
        for await (const chunk of result) {
          content.push(chunk);
        }
        return { content };
      }
      
      // Ensure result has correct format
      if (!result || !Array.isArray(result.content)) {
        throw new Error('Tool must return { content: Content[] }');
      }
      
      return result;
    } catch (error) {
      // Return error as result
      return {
        content: [{
          type: 'text',
          text: error.message || 'Tool execution failed'
        }],
        isError: true
      };
    }
  }

  /**
   * Read a resource by URI
   * @param {{ uri: string }} params - Resource URI
   * @returns {Promise<ReadResourceResult>}
   */
  async readResource({ uri }) {
    const url = new URL(uri);
    for (const entry of this.resources.values()) {
      const params = entry.uriTemplate.match(url);
      if (params) {
        // Validate parameters if schema exists
        if (entry.schema) {
          entry.schema.parse(params);
        }
        
        const result = await entry.handler(url, params);
        
        // Ensure result has correct format
        if (!result || !Array.isArray(result.contents)) {
          throw new Error('Resource handler must return { contents: ResourceContents[] }');
        }
        
        return result;
      }
    }
    throw new Error(`No resource matches URI: ${uri}`);
  }

  /**
   * Get a prompt with arguments
   * @param {{ name: string; arguments?: any }} params - Prompt name and arguments
   * @returns {Promise<GetPromptResult>} - Generated prompt result
   */
  async getPrompt({ name, arguments: args = {} }) {
    const entry = this.prompts.get(name);
    if (!entry) throw new Error(`Prompt '${name}' not found`);
    
    // Validate arguments if schema exists
    if (entry.schema) {
      args = entry.schema.parse(args);
    }
    
    const result = entry.handler(args);
    
    // Ensure result has correct format
    if (!result || !Array.isArray(result.messages)) {
      throw new Error('Prompt handler must return { messages: PromptMessage[] }');
    }
    
    // Add description if available
    if (entry.description && !result.description) {
      result.description = entry.description;
    }
    
    return result;
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

  // -- Server Capabilities --

  /**
   * Get server capabilities
   * @returns {{ tools?: {}; prompts?: {}; resources?: { subscribe?: boolean } }}
   */
  getServerCapabilities() {
    return {
      tools: {},
      prompts: {},
      resources: {
        subscribe: false // We don't support subscriptions in this implementation
      }
    };
  }
}