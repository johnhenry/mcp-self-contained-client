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

// Helper to normalize registration entries
const normalizeEntry = (name, optionsOrSchemaOrHandler, handler) => {
  const entry = { name, handler: null };
  
  if (typeof optionsOrSchemaOrHandler === 'function') {
    // Direct handler
    entry.handler = optionsOrSchemaOrHandler;
  } else if (handler) {
    // Options/schema + handler
    entry.handler = handler;
    if (optionsOrSchemaOrHandler && typeof optionsOrSchemaOrHandler.parse === 'function') {
      // It's a Zod schema
      entry.schema = optionsOrSchemaOrHandler;
    } else if (optionsOrSchemaOrHandler) {
      // It's options
      Object.assign(entry, optionsOrSchemaOrHandler);
    }
  }
  
  return entry;
};

// Helper to validate tool results
const validateToolResult = (result) => {
  if (!result || typeof result !== 'object') {
    throw new Error('Tool must return an object');
  }
  if (!Array.isArray(result.content)) {
    throw new Error('Tool must return { content: Content[] }');
  }
  return result;
};

// Helper to validate prompt results
const validatePromptResult = (result) => {
  if (!result || typeof result !== 'object') {
    throw new Error('Prompt handler must return an object');
  }
  if (!Array.isArray(result.messages)) {
    throw new Error('Prompt handler must return { messages: PromptMessage[] }');
  }
  return result;
};

// Helper to validate resource results
const validateResourceResult = (result) => {
  if (!result || typeof result !== 'object') {
    throw new Error('Resource handler must return an object');
  }
  if (!Array.isArray(result.contents)) {
    throw new Error('Resource handler must return { contents: ResourceContents[] }');
  }
  return result;
};

// Helper to get JSON schema from Zod schema
const getJsonSchema = (zodSchema) => {
  if (!zodSchema) return undefined;
  
  // Try to use built-in JSON schema generation if available
  if (typeof zodSchema.toJSON === 'function') {
    return zodSchema.toJSON();
  }
  
  // Fallback: return a minimal schema indicator
  // This avoids using internal _def property
  return {
    type: 'object',
    zodSchema: true // Indicator that this is a Zod schema
  };
};

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
   * @param {boolean} [preserveSlashes=false] - Whether to preserve slashes in parameter values
   * @returns {URL} - The filled URL
   */
  fill(params, preserveSlashes = false) {
    let filled = this.pattern;
    for (const key of this.keys) {
      const value = encodeURIComponent(params[key]);
      // Optionally preserve slashes if needed
      const encoded = preserveSlashes ? value.replace(/%2F/g, '/') : value;
      filled = filled.replace(`{${key}}`, encoded);
    }
    return new URL(filled);
  }
}

export class SelfContainedClient {
  /**
   * @param {{ name: string; version: string }} options - Client configuration
   * @param {import('./types').DeclarativeConfig} [declarativeConfig] - Optional declarative configuration
   */
  constructor(options, declarativeConfig) {
    this.name = options.name;
    this.version = options.version;

    /** @type {Map<string, ToolEntry>} */
    this.tools = new Map();
    
    /** @type {Map<string, ResourceEntry>} */
    this.resources = new Map();
    
    /** @type {Map<string, PromptEntry>} */
    this.prompts = new Map();
    
    // Process declarative configuration if provided
    if (declarativeConfig) {
      this._processDeclarativeConfig(declarativeConfig);
    }
  }

  /**
   * Process declarative configuration
   * @private
   * @param {import('./types').DeclarativeConfig} config - Declarative configuration
   */
  _processDeclarativeConfig(config) {
    // Process tools
    if (config.tools && Array.isArray(config.tools)) {
      for (const toolDef of config.tools) {
        const [name, ...args] = toolDef;
        
        if (args.length === 1) {
          // [name, handler]
          this.tool(name, args[0]);
        } else if (args.length === 2) {
          // [name, schema, handler]
          this.tool(name, args[0], args[1]);
        } else if (args.length === 3) {
          // [name, schema, handler, description]
          const schema = args[0];
          const handler = args[1];
          const description = args[2];
          
          if (schema && typeof schema === 'object' && !schema.parse) {
            // Plain object schema, convert to options with description
            this.tool(name, { inputSchema: schema, description }, handler);
          } else {
            // Zod schema
            this.tool(name, { schema, description }, handler);
          }
        }
      }
    }
    
    // Process prompts
    if (config.prompts && Array.isArray(config.prompts)) {
      for (const promptDef of config.prompts) {
        const [name, ...args] = promptDef;
        
        if (args.length === 1) {
          // [name, handler]
          this.prompt(name, args[0]);
        } else if (args.length === 2) {
          // [name, schema, handler]
          this.prompt(name, args[0], args[1]);
        } else if (args.length === 3) {
          // [name, schema, handler, description]
          const schema = args[0];
          const handler = args[1];
          const description = args[2];
          
          if (schema && typeof schema === 'object' && !schema.parse) {
            // Plain object schema, we'll treat it as arguments definition
            const argNames = Object.keys(schema);
            const promptArgs = argNames.map(arg => ({
              name: arg,
              required: true
            }));
            this.prompt(name, { arguments: promptArgs, description }, handler);
          } else {
            // Zod schema
            this.prompt(name, { schema, description }, handler);
          }
        }
      }
    }
    
    // Process resources
    if (config.resources && Array.isArray(config.resources)) {
      for (const resourceDef of config.resources) {
        const [name, uriPattern, ...args] = resourceDef;
        const template = new ResourceTemplate(uriPattern);
        
        if (args.length === 1) {
          // [name, uriPattern, handler]
          this.resource(name, template, args[0]);
        } else if (args.length === 2) {
          if (typeof args[1] === 'function') {
            // [name, uriPattern, schema, handler]
            this.resource(name, template, args[0], args[1]);
          } else {
            // [name, uriPattern, handler, options]
            this.resource(name, template, args[1], args[0]);
          }
        } else if (args.length === 3) {
          // [name, uriPattern, schema, handler, options]
          const schema = args[0];
          const handler = args[1];
          const options = args[2];
          this.resource(name, template, { ...options, schema }, handler);
        }
      }
    }
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
    const entry = normalizeEntry(name, optionsOrSchemaOrHandler, handler);
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
    const entry = normalizeEntry(name, optionsOrSchemaOrHandler, handler);
    this.prompts.set(name, entry);
  }

  /**
   * Register a resource
   * @overload
   * @param {string} name - Resource name
   * @param {string | ResourceTemplate} uriTemplate - URI template pattern or ResourceTemplate instance
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {string | ResourceTemplate} uriTemplate - URI template pattern or ResourceTemplate instance
   * @param {{ description?: string; mimeType?: string }} options - Resource options
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {string | ResourceTemplate} uriTemplate - URI template pattern or ResourceTemplate instance
   * @param {import('zod').ZodSchema} schema - Validation schema
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} name - Resource name
   * @param {string | ResourceTemplate} uriTemplate - URI template pattern or ResourceTemplate instance
   * @param {{ description?: string; mimeType?: string; schema?: import('zod').ZodSchema }} options - Resource options with schema
   * @param {ResourceHandler} handler - Resource handler function
   * @returns {void}
   */
  resource(name, uriTemplate, optionsOrSchemaOrHandler, handler) {
    const entry = normalizeEntry(name, optionsOrSchemaOrHandler, handler);
    // Convert string patterns to ResourceTemplate instances
    entry.uriTemplate = typeof uriTemplate === 'string' 
      ? new ResourceTemplate(uriTemplate)
      : uriTemplate;
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
        tool.inputSchema = getJsonSchema(t.schema);
      } else if (t.inputSchema) {
        tool.inputSchema = t.inputSchema;
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
      
      // Validate and return result
      return validateToolResult(result);
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
        
        // Validate and return result
        return validateResourceResult(result);
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
    
    // Validate result
    validatePromptResult(result);
    
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