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
 * @typedef {import('./types').ResourceWatcher} ResourceWatcher
 * @typedef {import('./types').ResourceSubscriptionResult} ResourceSubscriptionResult
 * @typedef {import('./types').ResourceNotification} ResourceNotification
 */

import { EventEmitter } from "events";
const SUPPORTED_VERSION = "2024-11-05"; // Current MCP protocol version

// Helper to normalize registration entries
const normalizeEntry = (name, optionsOrSchemaOrHandler, handler) => {
  const entry = { name, handler: null };

  if (typeof optionsOrSchemaOrHandler === "function") {
    // Direct handler
    entry.handler = optionsOrSchemaOrHandler;
  } else if (handler) {
    // Options/schema + handler
    entry.handler = handler;
    if (
      optionsOrSchemaOrHandler &&
      typeof optionsOrSchemaOrHandler.parse === "function"
    ) {
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
  if (!result || typeof result !== "object") {
    throw new Error("Tool must return an object");
  }
  if (!Array.isArray(result.content)) {
    throw new Error("Tool must return { content: Content[] }");
  }
  return result;
};

// Helper to validate prompt results
const validatePromptResult = (result) => {
  if (!result || typeof result !== "object") {
    throw new Error("Prompt handler must return an object");
  }
  if (!Array.isArray(result.messages)) {
    throw new Error("Prompt handler must return { messages: PromptMessage[] }");
  }
  return result;
};

// Helper to validate resource results
const validateResourceResult = (result) => {
  if (!result || typeof result !== "object") {
    throw new Error("Resource handler must return an object");
  }
  if (!Array.isArray(result.contents)) {
    throw new Error(
      "Resource handler must return { contents: ResourceContents[] }"
    );
  }
  return result;
};

// Helper to get JSON schema from Zod schema
const getJsonSchema = (zodSchema) => {
  if (!zodSchema) return undefined;

  // Try to use built-in JSON schema generation if available
  if (typeof zodSchema.toJSON === "function") {
    return zodSchema.toJSON();
  }

  // Fallback: return a minimal schema indicator
  // This avoids using internal _def property
  return {
    type: "object",
    zodSchema: true, // Indicator that this is a Zod schema
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
    if (!match) return null;
    // For patterns without placeholders, groups will be undefined, so return empty object
    return match.groups ?? {};
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
      const encoded = preserveSlashes ? value.replace(/%2F/g, "/") : value;
      filled = filled.replace(`{${key}}`, encoded);
    }
    return new URL(filled);
  }
}

export class MCPSelfContainedClient extends EventEmitter {
  /**
   * @param {{ name: string; version: string }} options - Client configuration
   * @param {import('./types').DeclarativeConfig} [declarativeConfig] - Optional declarative configuration
   */
  constructor(options, declarativeConfig) {
    super();
    this.name = options.name;
    this.version = options.version;

    /** @type {Map<string, ToolEntry>} */
    this.tools = new Map();

    /** @type {Map<string, ResourceEntry>} */
    this.resources = new Map();

    /** @type {Map<string, PromptEntry>} */
    this.prompts = new Map();

    /** @type {Map<string, Set<string>>} */
    this.resourceSubscriptions = new Map(); // URI -> Set of subscriber IDs

    /** @type {Map<string, Function>} */
    this.resourceWatchers = new Map(); // resourceName -> cleanup function

    /** @type {Map<string, Function>} */
    this.activeWatchers = new Map(); // URI -> cleanup function

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

          if (schema && typeof schema === "object" && !schema.parse) {
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

          if (schema && typeof schema === "object" && !schema.parse) {
            // Plain object schema, we'll treat it as arguments definition
            const argNames = Object.keys(schema);
            const promptArgs = argNames.map((arg) => ({
              name: arg,
              required: true,
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
          if (typeof args[1] === "function") {
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
  resource(name, uriTemplate, optionsOrSchemaOrHandler, handler, watcher) {
    // Handle different argument patterns
    let actualHandler = handler;
    let actualWatcher = watcher;
    let actualOptions = optionsOrSchemaOrHandler;

    // Determine the pattern based on argument types
    if (
      typeof optionsOrSchemaOrHandler === "function" &&
      typeof handler === "function" &&
      !watcher
    ) {
      // Pattern: resource(name, template, handler, watcher)
      actualHandler = optionsOrSchemaOrHandler;
      actualWatcher = handler;
      actualOptions = undefined;
    } else if (typeof optionsOrSchemaOrHandler === "function" && !handler) {
      // Pattern: resource(name, template, handler)
      actualHandler = optionsOrSchemaOrHandler;
      actualWatcher = undefined;
      actualOptions = undefined;
    }
    // Otherwise it's: resource(name, template, options, handler, [watcher])

    const entry = normalizeEntry(name, actualOptions, actualHandler);
    // Convert string patterns to ResourceTemplate instances
    entry.uriTemplate =
      typeof uriTemplate === "string"
        ? new ResourceTemplate(uriTemplate)
        : uriTemplate;
    this.resources.set(name, entry);

    // Register watcher if provided
    if (actualWatcher) {
      this.resourceWatchers.set(name, actualWatcher);
    }

    // Notify list changed
    this._notifyResourceListChanged();
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
        name: t.name,
        inputSchema: { type: "object" }, // Default empty object schema
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
        name: p.name,
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
        name: entry.name,
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
        name: r.name,
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
      if (
        result &&
        typeof result === "object" &&
        Symbol.asyncIterator in result
      ) {
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
        content: [
          {
            type: "text",
            text: error.message || "Tool execution failed",
          },
        ],
        isError: true,
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
   * @returns {{ tools?: {}; prompts?: {}; resources?: { subscribe?: boolean; listChanged?: boolean } }}
   */
  getServerCapabilities() {
    return {
      tools: {},
      prompts: {},
      resources: {
        subscribe: true, // Support resource subscriptions
        listChanged: true, // Support list change notifications
      },
    };
  }

  // -- Resource Subscription Methods --

  /**
   * Subscribe to resource changes
   * @param {{ uri: string }} params - Resource URI to subscribe to
   * @returns {Promise<{}>}
   */
  async subscribeToResource({ uri }) {
    if (!this.resourceSubscriptions.has(uri)) {
      this.resourceSubscriptions.set(uri, new Set());

      // Start watching this resource if we have a watcher
      const resourceName = this._findResourceNameByUri(uri);
      if (resourceName && this.resourceWatchers.has(resourceName)) {
        const watcher = this.resourceWatchers.get(resourceName);
        const cleanup = watcher(uri, () => this._notifyResourceUpdated(uri));
        if (cleanup && typeof cleanup === "function") {
          this.activeWatchers.set(uri, cleanup);
        }
      }
    }

    // Add a generic subscriber
    this.resourceSubscriptions.get(uri).add("client");

    // Return subscription object that includes the URI
    return { _meta: { uri } };
  }

  /**
   * Unsubscribe from resource changes
   * @param {{ uri?: string, _meta?: { uri?: string } } | { uri: string }} params
   * @returns {Promise<{}>}
   */
  async unsubscribeFromResource(params) {
    // Handle both direct URI and _meta.uri formats
    const uri = params.uri || params._meta?.uri;
    if (!uri) return {};

    const subscribers = this.resourceSubscriptions.get(uri);
    if (!subscribers) return {};

    // Remove all subscribers for this URI
    this.resourceSubscriptions.delete(uri);

    // Stop watching
    const cleanup = this.activeWatchers.get(uri);
    if (cleanup) {
      cleanup();
      this.activeWatchers.delete(uri);
    }

    return {};
  }

  /**
   * Get list of resource subscriptions
   * @returns {Promise<{ subscriptions: Array<{ uri: string; subscriberCount: number }> }>}
   */
  async listResourceSubscriptions() {
    const subscriptions = [];
    for (const [uri, subscribers] of this.resourceSubscriptions.entries()) {
      subscriptions.push({
        uri,
        subscriberCount: subscribers.size,
      });
    }
    return { subscriptions };
  }

  // -- Private Subscription Helper Methods --

  /**
   * Find resource name by URI
   * @private
   * @param {string} uri - Resource URI
   * @returns {string | null} - Resource name or null if not found
   */
  _findResourceNameByUri(uri) {
    const url = new URL(uri);
    for (const [name, entry] of this.resources.entries()) {
      const params = entry.uriTemplate.match(url);
      if (params) {
        return name;
      }
    }
    return null;
  }

  /**
   * Notify subscribers of resource changes
   * @private
   * @param {string} uri - Resource URI that changed
   */
  _notifyResourceUpdated(uri) {
    const subscribers = this.resourceSubscriptions.get(uri);
    if (subscribers && subscribers.size > 0) {
      this.emit("notification", {
        method: "notifications/resources/updated",
        params: { uri },
      });
    }
  }

  /**
   * Notify of resource list changes
   * @private
   */
  _notifyResourceListChanged() {
    this.emit("notification", {
      method: "notifications/resources/list_changed",
      params: {},
    });
  }

  /**
   * Manually trigger a resource update notification
   * @param {string} uri - Resource URI to notify about
   */
  notifyResourceChanged(uri) {
    this._notifyResourceUpdated(uri);
  }

  /**
   * Clean up all subscriptions and watchers
   */
  cleanup() {
    // Clean up all active watchers
    for (const cleanup of this.activeWatchers.values()) {
      if (typeof cleanup === "function") {
        cleanup();
      }
    }
    this.activeWatchers.clear();
    this.resourceSubscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Connect to a transport for MCP protocol communication
   * @param {import('./types').Transport} transport - The transport to connect to
   * @returns {Promise<void>}
   */
  async connect(transport) {
    this.transport = transport;
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._initialized = false;

    // Set up transport callbacks
    transport.onmessage = (message) => this._handleMessage(message);
    transport.onerror = (error) => this._handleError(error);
    transport.onclose = () => this._handleClose();

    // Start the transport
    await transport.start();

    // The server waits for client to send initialize request
    // We don't send anything here - we just wait for incoming messages
  }

  /**
   * Handle incoming JSON-RPC messages
   * @private
   * @param {import('./types').JSONRPCMessage} message
   */
  async _handleMessage(message) {
    try {
      if ("method" in message && "id" in message) {
        // This is a request
        await this._handleRequest(message);
      } else if ("method" in message && !("id" in message)) {
        // This is a notification
        await this._handleNotification(message);
      } else if ("result" in message || "error" in message) {
        // This is a response to our request
        this._handleResponse(message);
      }
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Handle JSON-RPC requests from client
   * @private
   * @param {import('./types').JSONRPCRequest} request
   */
  async _handleRequest(request) {
    try {
      let result;

      switch (request.method) {
        case "initialize":
          result = await this._handleInitialize(request.params);
          break;

        case "tools/list":
          result = await this.listTools();
          break;

        case "tools/call":
          result = await this.callTool(request.params);
          break;

        case "prompts/list":
          result = await this.listPrompts();
          break;

        case "prompts/get":
          result = await this.getPrompt(request.params);
          break;

        case "resources/list":
          result = await this.listResources();
          break;

        case "resources/templates/list":
          result = await this.listResourceTemplates();
          break;

        case "resources/read":
          result = await this.readResource(request.params);
          break;

        case "resources/subscribe":
          result = await this.subscribeToResource(request.params);
          break;

        case "resources/unsubscribe":
          result = await this.unsubscribeFromResource(request.params);
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      // Send response
      await this._sendResponse(request.id, result);
    } catch (error) {
      // Send error response
      await this._sendError(request.id, -32603, error.message, error);
    }
  }

  /**
   * Handle JSON-RPC notifications from client
   * @private
   * @param {import('./types').JSONRPCNotification} notification
   */
  async _handleNotification(notification) {
    switch (notification.method) {
      case "initialized":
        this._initialized = true;
        break;
      case "cancelled":
        // Handle request cancellation if needed
        break;
    }
  }

  /**
   * Handle JSON-RPC responses from server
   * @private
   * @param {import('./types').JSONRPCResponse | import('./types').JSONRPCError} response
   */
  _handleResponse(response) {
    const pending = this._pendingRequests.get(response.id);
    if (pending) {
      this._pendingRequests.delete(response.id);
      if ("result" in response) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error.message));
      }
    }
  }

  /**
   * Handle transport errors
   * @private
   * @param {Error} error
   */
  _handleError(error) {
    this.emit("error", error);
  }

  /**
   * Handle transport close
   * @private
   */
  _handleClose() {
    // Reject all pending requests
    for (const pending of this._pendingRequests.values()) {
      pending.reject(new Error("Transport closed"));
    }
    this._pendingRequests.clear();
    this.cleanup();
    this.emit("close");
  }

  /**
   * Handle initialize request
   * @private
   * @param {any} params
   * @returns {Promise<import('./types').InitializeResult>}
   */
  async _handleInitialize(params) {
    // Validate protocol version
    const clientVersion = params.protocolVersion;

    // For now, we'll accept any version and return our supported version
    return {
      protocolVersion: SUPPORTED_VERSION,
      clientVersion,
      capabilities: this.getServerCapabilities(),
      serverInfo: {
        name: this.name,
        version: this.version,
      },
    };
  }

  /**
   * Send a JSON-RPC response
   * @private
   * @param {string | number} id
   * @param {any} result
   */
  async _sendResponse(id, result) {
    if (!this.transport) return;

    const response = {
      jsonrpc: "2.0",
      id,
      result,
    };

    await this.transport.send(response);
  }

  /**
   * Send a JSON-RPC error response
   * @private
   * @param {string | number} id
   * @param {number} code
   * @param {string} message
   * @param {any} [data]
   */
  async _sendError(id, code, message, data) {
    if (!this.transport) return;

    const response = {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        data,
      },
    };

    await this.transport.send(response);
  }

  /**
   * Send a JSON-RPC notification
   * @private
   * @param {string} method
   * @param {any} [params]
   */
  async _sendNotification(method, params) {
    if (!this.transport) return;

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    await this.transport.send(notification);
  }

  /**
   * Override notification method to also send via transport
   * @private
   * @param {string} uri
   */
  _notifyResourceUpdated(uri) {
    const notification = {
      method: "notifications/resources/updated",
      params: { uri },
    };

    // Emit local event
    this.emit("notification", notification);

    // Send via transport if connected (removed _initialized check for notifications)
    if (this.transport) {
      this._sendNotification(notification.method, notification.params);
    }
  }

  /**
   * Override notification method to also send via transport
   * @private
   */
  _notifyResourceListChanged() {
    const notification = {
      method: "notifications/resources/list_changed",
      params: {},
    };

    // Emit local event
    this.emit("notification", notification);

    // Send via transport if connected (removed _initialized check for notifications)
    if (this.transport) {
      this._sendNotification(notification.method, notification.params);
    }
  }
}
