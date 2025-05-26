# MCPSelfContainedClient

A dynamic, in-memory implementation of a Model Context Protocol (MCP) client that allows you to define and manage tools, prompts, and resources locally—without connecting to an external server.

This client fully implements the MCP contract from the client's perspective, enabling:

- 🔧 Tool execution with argument validation and error handling
- 💬 Prompt generation with structured messages
- 🗂️ Resource management with URI template matching
- 📡 Resource subscriptions with real-time notifications
- 🔌 Transport support for client-server communication
- ✅ Full TypeScript support with JSDoc annotations
- 🔍 Introspection capabilities for all registered items

## ✨ Features

- ✅ No server required – works entirely in-process
- 🔧 Dynamically add/remove tools, prompts, and resources
- 🧪 Optional validation via Zod schemas
- 🔄 Streamable tool outputs (via async generators)
- 🧠 Comprehensive introspection and listing methods
- 🗂️ Namespace-based organization and bulk deletion
- 🛡️ Error handling that returns MCP-compliant error results

---

## 📦 Installation

This module is self-contained. Just copy `index.mjs` and `types.d.ts` into your project.

If you're using Zod for validation:

```bash
npm install zod
```

---

## 🛠️ Usage

### Create a Client

```js
import { MCPSelfContainedClient } from "./index.mjs";

const client = new MCPSelfContainedClient({
  name: "my-mcp-client",
  version: "1.0.0",
});
```

### Declarative Configuration

You can also create a client with all capabilities defined declaratively, similar to [mcp-declarative-server](https://www.npmjs.com/package/mcp-declarative-server):

```js
const client = new MCPSelfContainedClient(
  {
    name: "my-mcp-client",
    version: "1.0.0",
  },
  {
    tools: [
      // Simple tool: [name, handler]
      [
        "greeting",
        async ({ name }) => ({
          content: [{ type: "text", text: `Hello, ${name}!` }],
        }),
      ],

      // With schema: [name, schema, handler]
      [
        "calculate",
        { a: "number", b: "number" },
        async ({ a, b }) => ({
          content: [{ type: "text", text: `Sum: ${a + b}` }],
        }),
      ],

      // With Zod schema and description: [name, schema, handler, description]
      [
        "divide",
        z.object({
          dividend: z.number(),
          divisor: z.number().refine((n) => n !== 0, "Cannot divide by zero"),
        }),
        async ({ dividend, divisor }) => ({
          content: [{ type: "text", text: `Result: ${dividend / divisor}` }],
        }),
        "Divides two numbers",
      ],
    ],

    prompts: [
      // Simple prompt: [name, handler]
      [
        "welcome",
        ({ name }) => ({
          messages: [
            {
              role: "user",
              content: { type: "text", text: `Welcome, ${name}!` },
            },
          ],
        }),
      ],

      // With schema and description: [name, schema, handler, description]
      [
        "code-review",
        { language: "string", code: "string" },
        ({ language, code }) => ({
          messages: [
            {
              role: "system",
              content: { type: "text", text: `You are a ${language} expert.` },
            },
            {
              role: "user",
              content: { type: "text", text: `Review this code:\n${code}` },
            },
          ],
        }),
        "Generate a code review prompt",
      ],
    ],

    resources: [
      // Simple resource: [name, uriPattern, handler]
      [
        "docs",
        "docs://{page}",
        async (uri, { page }) => ({
          contents: [
            {
              uri: uri.href,
              text: `Documentation for ${page}`,
            },
          ],
        }),
      ],

      // With options: [name, uriPattern, handler, options]
      [
        "api",
        "api://{endpoint}",
        async (uri, { endpoint }) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ endpoint, data: "..." }),
            },
          ],
        }),
        { description: "API endpoint data", mimeType: "application/json" },
      ],
    ],
  }
);
```

You can mix declarative and imperative registration - tools, prompts, and resources added via the declarative config work exactly the same as those added via the imperative API.

### Tools

Tools are functions that can be called with arguments and return content.

#### Register a Simple Tool

```js
client.tool("echo", async ({ message }) => ({
  content: [{ type: "text", text: `Echo: ${message}` }],
}));
```

#### Register a Tool with Description

```js
client.tool(
  "calculate",
  { description: "Performs basic calculations" },
  async ({ operation, a, b }) => {
    const result = operation === "add" ? a + b : a - b;
    return {
      content: [{ type: "text", text: `Result: ${result}` }],
    };
  }
);
```

#### Register a Tool with Zod Validation

```js
import { z } from "zod";

client.tool(
  "divide",
  z.object({
    dividend: z.number(),
    divisor: z.number().refine((n) => n !== 0, "Cannot divide by zero"),
  }),
  async ({ dividend, divisor }) => ({
    content: [{ type: "text", text: `${dividend / divisor}` }],
  })
);
```

#### Call a Tool

```js
const result = await client.callTool({
  name: "echo",
  arguments: { message: "Hello, MCP!" },
});
// result: { content: [{ type: "text", text: "Echo: Hello, MCP!" }] }
```

#### List Tools

```js
const { tools } = await client.listTools();
// tools: [{ name: "echo" }, { name: "calculate", description: "Performs basic calculations" }]
```

#### Handle Tool Errors

Tools that throw errors or have validation failures return error results:

```js
const result = await client.callTool({
  name: "divide",
  arguments: { dividend: 10, divisor: 0 },
});
// result: { content: [{ type: "text", text: "Cannot divide by zero" }], isError: true }
```

### Prompts

Prompts generate structured message templates based on arguments.

#### Register a Simple Prompt

```js
client.prompt("greeting", ({ name }) => ({
  messages: [
    {
      role: "user",
      content: { type: "text", text: `Hello, ${name}!` },
    },
  ],
}));
```

#### Register a Prompt with Metadata

```js
client.prompt(
  "code-review",
  {
    description: "Generate a code review request",
    arguments: [
      { name: "language", description: "Programming language", required: true },
      { name: "code", description: "Code to review", required: true },
    ],
  },
  ({ language, code }) => ({
    messages: [
      {
        role: "system",
        content: {
          type: "text",
          text: `You are a ${language} code reviewer.`,
        },
      },
      {
        role: "user",
        content: {
          type: "text",
          text: `Please review this code:\n\n${code}`,
        },
      },
    ],
  })
);
```

#### Get a Prompt

```js
const result = await client.getPrompt({
  name: "greeting",
  arguments: { name: "Alice" },
});
// result: { messages: [{ role: "user", content: { type: "text", text: "Hello, Alice!" } }] }
```

#### List Prompts

```js
const { prompts } = await client.listPrompts();
// prompts: [{ name: "greeting" }, { name: "code-review", description: "Generate a code review request", arguments: [...] }]
```

### Resources

Resources provide access to content via URI patterns.

#### Register a Simple Resource

```js
import { ResourceTemplate } from "./index.mjs";

client.resource(
  "file-content",
  new ResourceTemplate("file://{path}"),
  async (uri, { path }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Contents of ${path}`,
      },
    ],
  })
);
```

#### Register a Resource with Metadata

```js
client.resource(
  "api-docs",
  new ResourceTemplate("docs://{section}/{page}"),
  {
    description: "API documentation pages",
    mimeType: "text/markdown",
  },
  async (uri, { section, page }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# ${section} - ${page}\n\nDocumentation content here...`,
      },
    ],
  })
);
```

#### Read a Resource

```js
const result = await client.readResource({
  uri: "file://readme.txt",
});
// result: { contents: [{ uri: "file://readme.txt", text: "Contents of readme.txt" }] }
```

#### Resource Subscriptions

Resources can have watchers that monitor changes and notify subscribers:

```js
// Register a resource with a watcher
let temperature = 20;
client.resource(
  "temperature",
  "sensor://temperature",
  async () => ({
    contents: [{
      uri: "sensor://temperature",
      mimeType: "application/json",
      text: JSON.stringify({ value: temperature, unit: "celsius" })
    }]
  }),
  // Watcher function
  (uri, notifyChange) => {
    const interval = setInterval(() => {
      temperature += (Math.random() - 0.5) * 2; // Simulate temperature changes
      notifyChange(); // Notify subscribers of the change
    }, 1000);
    
    // Return cleanup function
    return () => clearInterval(interval);
  }
);

// Subscribe to resource changes
const { subscriberId } = await client.subscribeToResource({ 
  uri: "sensor://temperature" 
});

// Listen for notifications
client.on('notification', (notification) => {
  if (notification.method === 'notifications/resources/updated') {
    console.log(`Resource updated: ${notification.params.uri}`);
  }
});

// Unsubscribe when done
await client.unsubscribeFromResource({ uri: "sensor://temperature", subscriberId });
```

#### List Resources and Templates

```js
// List all resources
const { resources } = await client.listResources();
// resources: [{ uri: "file://{path}", name: "file-content" }]

// List resource templates with full details
const { resourceTemplates } = await client.listResourceTemplates();
// resourceTemplates: [{ uriTemplate: "docs://{section}/{page}", name: "api-docs", description: "API documentation pages", mimeType: "text/markdown" }]
```

#### Resource with Binary Content

Resources can return base64-encoded binary data:

```js
client.resource(
  "image",
  new ResourceTemplate("image://{name}"),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "image/png",
        blob: Buffer.from(imageData).toString("base64"),
      },
    ],
  })
);
```

### Advanced Features

#### Streaming Tool Output

Tools can return async generators for streaming content:

```js
client.tool("count", async function* ({ to }) {
  for (let i = 1; i <= to; i++) {
    yield { type: "text", text: `Count: ${i}\n` };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

const result = await client.callTool({
  name: "count",
  arguments: { to: 5 },
});
// result.content will contain all yielded items
```

#### Namespace Management

Organize tools, prompts, and resources using namespaces:

```js
// Register namespaced items
client.tool("math:add", async ({ a, b }) => ({
  content: [{ type: "text", text: `${a + b}` }],
}));

client.tool("math:multiply", async ({ a, b }) => ({
  content: [{ type: "text", text: `${a * b}` }],
}));

client.tool("string:reverse", async ({ text }) => ({
  content: [{ type: "text", text: text.split("").reverse().join("") }],
}));

// Delete entire namespace
client.deleteNamespace("math"); // Removes math:add and math:multiply
```

#### Server Capabilities

Get information about what the client supports:

```js
const capabilities = client.getServerCapabilities();
// {
//   tools: {},
//   prompts: {},
//   resources: { subscribe: true, listChanged: true }
// }
```

### Error Handling

The client provides robust error handling:

1. **Tool not found**: Throws an error
2. **Validation errors**: Returns error result with `isError: true`
3. **Handler errors**: Returns error result with error message
4. **Invalid return format**: Throws an error

Example error handling:

```js
try {
  const result = await client.callTool({
    name: "nonexistent",
    arguments: {},
  });
} catch (error) {
  console.error("Tool not found:", error.message);
}

// Validation error returns error result
const result = await client.callTool({
  name: "divide",
  arguments: { dividend: "not a number", divisor: 2 },
});
if (result.isError) {
  console.error("Tool error:", result.content[0].text);
}
```

---

## 🔎 API Reference

### Constructor

```js
new MCPSelfContainedClient(
  options: {
    name: string;
    version: string;
  },
  declarativeConfig?: {
    tools?: Array<[name, handler] | [name, schema, handler] | [name, schema, handler, description]>;
    prompts?: Array<[name, handler] | [name, schema, handler] | [name, schema, handler, description]>;
    resources?: Array<[name, uriPattern, handler] | [name, uriPattern, handler, options] | [name, uriPattern, schema, handler, options]>;
  }
)
```

### Tool Methods

- `tool(name: string, handler: ToolHandler): void`
- `tool(name: string, options: { description?: string }, handler: ToolHandler): void`
- `tool(name: string, schema: ZodSchema, handler: ToolHandler): void`
- `listTools(): Promise<{ tools: Tool[] }>`
- `callTool(params: { name: string; arguments?: any }): Promise<ToolResult>`
- `deleteTool(name: string): void`

### Prompt Methods

- `prompt(name: string, handler: PromptHandler): void`
- `prompt(name: string, options: { description?: string; arguments?: PromptArgument[] }, handler: PromptHandler): void`
- `prompt(name: string, schema: ZodSchema, handler: PromptHandler): void`
- `listPrompts(): Promise<{ prompts: Prompt[] }>`
- `getPrompt(params: { name: string; arguments?: any }): Promise<GetPromptResult>`
- `deletePrompt(name: string): void`

### Resource Methods

- `resource(name: string, uriTemplate: ResourceTemplate, handler: ResourceHandler): void`
- `resource(name: string, uriTemplate: ResourceTemplate, options: { description?: string; mimeType?: string }, handler: ResourceHandler): void`
- `resource(name: string, uriTemplate: ResourceTemplate, schema: ZodSchema, handler: ResourceHandler): void`
- `listResources(): Promise<{ resources: Resource[] }>`
- `listResourceTemplates(): Promise<{ resourceTemplates: Array }>`
- `readResource(params: { uri: string }): Promise<ReadResourceResult>`
- `deleteResource(name: string): void`

### Utility Methods

- `deleteNamespace(prefix: string): void`
- `getServerCapabilities(): ServerCapabilities`

---

## 📁 Files

- `index.mjs`: Core JavaScript implementation with JSDoc type annotations
- `types.d.ts`: TypeScript type definitions for full type safety

---

## 🧠 Why Use This?

This is ideal for:

- Testing MCP-compatible applications without a backend
- Prototyping LLM toolchains or local pipelines
- Embedding MCP functionality in constrained environments
- Building mock MCP servers for development
- Creating dynamic tool/prompt/resource systems

---

## 🔌 Transport Support

The client can now act as an MCP server by connecting to a transport:

```js
import { MCPSelfContainedClient, InMemoryTransport } from "./index.mjs";

// Create server
const server = new MCPSelfContainedClient({
  name: "my-server",
  version: "1.0.0"
});

// Add capabilities
server.tool("greet", async ({ name }) => ({
  content: [{ type: "text", text: `Hello, ${name}!` }]
}));

// Connect to transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

The client supports the full MCP protocol including:
- Initialize/initialized handshake
- Tool, prompt, and resource operations
- Resource subscriptions with notifications
- Error handling and transport lifecycle

See `demo/transport-demo.mjs` for a complete example using in-memory transport.

## 🧩 Future Ideas

- Implement request/response logging
- Add middleware support for cross-cutting concerns
- Support for custom content types beyond text/image

---

## 📜 License

MIT License (or whatever suits your use case)
