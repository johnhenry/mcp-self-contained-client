# SelfContainedClient

A dynamic, in-memory implementation of a Model Context Protocol (MCP) client that allows you to define and manage tools, prompts, and resources locally—without connecting to an external server.

This client fully implements the MCP contract from the client’s perspective, enabling:

- Tool execution with optional argument validation
- Prompt generation based on input parameters
- Resource resolution based on URI templates
- Full introspection and deletion capabilities

## ✨ Features

- ✅ No server required – works entirely in-process
- 🔧 Dynamically add/remove tools, prompts, and resources
- 🧪 Optional validation via Zod schemas
- 🔄 Streamable tool/resource outputs (via `for await`)
- 🧠 Descriptive introspection (`describeTool`, etc.)
- 🗂️ Namespace-based organization and deletion

---

## 📦 Installation

This module is self-contained. Just copy `index.mjs` and `types.d.ts` into your project.

If you're using Zod for validation:

```bash
npm install zod
```

---

## 🛠️ Usage

### 1. Create a client

```ts
import {
  SelfContainedClient,
  ResourceTemplate,
} from "./index.mjs";
import { z } from "zod";

const client = new SelfContainedClient({
  name: "local-client",
  version: "1.0.0",
});
```

---

### 2. Register a tool

```ts
client.tool("echo", z.object({ message: z.string() }), async ({ message }) => ({
  content: [{ type: "text", text: `Echo: ${message}` }],
}));
```

Call the tool:

```ts
const result = await client.callTool({
  name: "echo",
  arguments: { message: "hello" },
});
```

---

### 3. Register a prompt

```ts
client.prompt("greeting", z.object({ name: z.string() }), ({ name }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Hello, ${name}!`,
      },
    },
  ],
}));

const prompt = client.getPrompt({
  name: "greeting",
  arguments: { name: "Alice" },
});
```

---

### 4. Register a resource

```ts
client.resource(
  "echo-resource",
  new ResourceTemplate("echo://{message}"),
  async (uri, { message }) => ({
    contents: [{ uri: uri.href, text: `Echoed: ${message}` }],
  }),
  z.object({ message: z.string() }) // optional
);

const res = await client.readResource({
  uri: "echo://hello",
});
```

---

## 🧹 Dynamic Deletion

```ts
client.deleteTool("echo");
client.deletePrompt("greeting");
client.deleteResource("echo-resource");

client.deleteNamespace("math"); // Removes math:* entries
```

---

## 🔎 Introspection

```ts
client.listTools(); // ['echo']
client.describeTool("echo"); // { name: "echo", schema: ... }

client.listResources(true); // With schema and template
client.describePrompt("greeting");
```

---

## 📁 Files

- `index.mjs`: Main implementation (JavaScript with JSDoc types)
- `types.d.ts`: TypeScript type definitions
- `ResourceTemplate`: Mini URI matcher and expander (exported from index.mjs)

---

## 🧠 Why Use This?

This is ideal for:

- Testing MCP-compatible apps without a backend
- Prototyping LLM toolchains or local pipelines
- Embedding logic-rich assistants in constrained environments (Electron, edge runtimes)

---

## 🧩 Future Ideas

- Add support for `promptTemplate()` via string-based prompt definitions (if needed)
- Embed metadata in prompt/tool/resource declarations (e.g. categories, tags)
- Optional persistence layer (e.g. IndexedDB, SQLite)

---

## 📜 License

MIT License (or whatever suits your use case)
