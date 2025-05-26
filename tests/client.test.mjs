import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { MCPSelfContainedClient } from "../index.mjs";

describe("MCPSelfContainedClient", () => {
  test("constructor", () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    assert.equal(client.name, "test-client");
    assert.equal(client.version, "1.0.0");
  });

  describe("Tools", () => {
    test("register and call tool without schema", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("echo", async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }],
      }));

      const result = await client.callTool({
        name: "echo",
        arguments: { message: "hello" },
      });

      assert.deepEqual(result, {
        content: [{ type: "text", text: "Echo: hello" }],
      });
    });

    test("register tool with description", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool(
        "echo",
        { description: "Echoes the message" },
        async ({ message }) => ({
          content: [{ type: "text", text: `Echo: ${message}` }],
        })
      );

      const { tools } = await client.listTools();
      assert.equal(tools[0].description, "Echoes the message");
    });

    test("register and call tool with schema", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const schema = z.object({
        a: z.number(),
        b: z.number(),
      });

      client.tool("add", schema, async ({ a, b }) => ({
        content: [{ type: "text", text: `${a + b}` }],
      }));

      const result = await client.callTool({
        name: "add",
        arguments: { a: 5, b: 3 },
      });

      assert.deepEqual(result, {
        content: [{ type: "text", text: "8" }],
      });
    });

    test("tool with invalid schema returns error", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const schema = z.object({
        a: z.number(),
        b: z.number(),
      });

      client.tool("add", schema, async ({ a, b }) => ({
        content: [{ type: "text", text: `${a + b}` }],
      }));

      const result = await client.callTool({
        name: "add",
        arguments: { a: "not a number", b: 3 },
      });

      assert.equal(result.isError, true);
      assert.equal(result.content[0].type, "text");
      assert.match(result.content[0].text, /Expected number/);
    });

    test("call non-existent tool throws", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      await assert.rejects(
        client.callTool({
          name: "nonexistent",
          arguments: {},
        }),
        /Tool 'nonexistent' not found/
      );
    });

    test("tool that throws returns error result", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("failing", async () => {
        throw new Error("Tool failed");
      });

      const result = await client.callTool({
        name: "failing",
        arguments: {},
      });

      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, "Tool failed");
    });

    test("tool with async iterator", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("stream", async function* ({ count }) {
        for (let i = 0; i < count; i++) {
          yield { type: "text", text: `Item ${i}` };
        }
      });

      const result = await client.callTool({
        name: "stream",
        arguments: { count: 3 },
      });

      assert.deepEqual(result, {
        content: [
          { type: "text", text: "Item 0" },
          { type: "text", text: "Item 1" },
          { type: "text", text: "Item 2" },
        ],
      });
    });

    test("list tools returns proper format", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("tool1", () => ({ content: [] }));
      client.tool("tool2", { description: "Tool 2" }, () => ({ content: [] }));

      const result = await client.listTools();
      assert.ok(result.tools);
      assert.equal(result.tools.length, 2);
      assert.equal(result.tools[0].name, "tool1");
      assert.equal(result.tools[1].name, "tool2");
      assert.equal(result.tools[1].description, "Tool 2");
    });

    test("delete tool", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("temp", () => ({ content: [] }));
      let { tools } = await client.listTools();
      assert.equal(tools.length, 1);

      client.deleteTool("temp");
      ({ tools } = await client.listTools());
      assert.equal(tools.length, 0);

      await assert.rejects(
        client.callTool({ name: "temp", arguments: {} }),
        /Tool 'temp' not found/
      );
    });
  });

  describe("Prompts", () => {
    test("register and get prompt without schema", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.prompt("greeting", ({ name }) => ({
        messages: [
          {
            role: "user",
            content: { type: "text", text: `Hello, ${name}!` },
          },
        ],
      }));

      const result = await client.getPrompt({
        name: "greeting",
        arguments: { name: "Alice" },
      });

      assert.deepEqual(result, {
        messages: [
          {
            role: "user",
            content: { type: "text", text: "Hello, Alice!" },
          },
        ],
      });
    });

    test("register prompt with description and arguments", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.prompt(
        "greeting",
        {
          description: "A friendly greeting",
          arguments: [
            { name: "name", description: "The name to greet", required: true },
          ],
        },
        ({ name }) => ({
          messages: [
            {
              role: "user",
              content: { type: "text", text: `Hello, ${name}!` },
            },
          ],
        })
      );

      const { prompts } = await client.listPrompts();
      assert.equal(prompts[0].description, "A friendly greeting");
      assert.equal(prompts[0].arguments[0].name, "name");
      assert.equal(prompts[0].arguments[0].required, true);

      const result = await client.getPrompt({
        name: "greeting",
        arguments: { name: "Bob" },
      });
      assert.equal(result.description, "A friendly greeting");
    });

    test("register and get prompt with schema", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      client.prompt("intro", schema, ({ name, age }) => ({
        messages: [
          {
            role: "user",
            content: { type: "text", text: `I'm ${name}, ${age} years old` },
          },
        ],
      }));

      const result = await client.getPrompt({
        name: "intro",
        arguments: { name: "Bob", age: 25 },
      });

      assert.deepEqual(result, {
        messages: [
          {
            role: "user",
            content: { type: "text", text: "I'm Bob, 25 years old" },
          },
        ],
      });
    });

    test("prompt with invalid schema throws", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const schema = z.object({
        age: z.number(),
      });

      client.prompt("age-prompt", schema, ({ age }) => ({
        messages: [
          { role: "user", content: { type: "text", text: `Age: ${age}` } },
        ],
      }));

      await assert.rejects(
        client.getPrompt({
          name: "age-prompt",
          arguments: { age: "not a number" },
        }),
        /Expected number/
      );
    });

    test("get non-existent prompt throws", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      await assert.rejects(
        client.getPrompt({
          name: "nonexistent",
          arguments: {},
        }),
        /Prompt 'nonexistent' not found/
      );
    });

    test("list prompts returns proper format", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.prompt("prompt1", () => ({ messages: [] }));
      client.prompt("prompt2", { description: "Prompt 2" }, () => ({
        messages: [],
      }));

      const result = await client.listPrompts();
      assert.ok(result.prompts);
      assert.equal(result.prompts.length, 2);
      assert.equal(result.prompts[0].name, "prompt1");
      assert.equal(result.prompts[1].name, "prompt2");
      assert.equal(result.prompts[1].description, "Prompt 2");
    });

    test("delete prompt", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.prompt("temp", () => ({ messages: [] }));
      let { prompts } = await client.listPrompts();
      assert.equal(prompts.length, 1);

      client.deletePrompt("temp");
      ({ prompts } = await client.listPrompts());
      assert.equal(prompts.length, 0);

      await assert.rejects(
        client.getPrompt({ name: "temp", arguments: {} }),
        /Prompt 'temp' not found/
      );
    });
  });

  describe("Server capabilities", () => {
    test("getServerCapabilities returns expected structure", () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const capabilities = client.getServerCapabilities();
      assert.deepEqual(capabilities, {
        tools: {},
        prompts: {},
        resources: {
          subscribe: true,
          listChanged: true,
        },
      });
    });
  });

  describe("Namespace deletion", () => {
    test("delete namespace removes all matching entries", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      // Add various entries
      client.tool("math__add", () => ({ content: [] }));
      client.tool("math__subtract", () => ({ content: [] }));
      client.tool("string__concat", () => ({ content: [] }));

      client.prompt("math__formula", () => ({ messages: [] }));
      client.prompt("string__template", () => ({ messages: [] }));

      // Verify all exist
      let { tools } = await client.listTools();
      let { prompts } = await client.listPrompts();
      assert.equal(tools.length, 3);
      assert.equal(prompts.length, 2);

      // Delete math namespace
      client.deleteNamespace("math");

      // Verify only string entries remain
      ({ tools } = await client.listTools());
      ({ prompts } = await client.listPrompts());
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "string__concat");
      assert.equal(prompts.length, 1);
      assert.equal(prompts[0].name, "string__template");
    });

    test("delete namespace with no matches does nothing", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("tool1", () => ({ content: [] }));
      client.prompt("prompt1", () => ({ messages: [] }));

      client.deleteNamespace("nonexistent");

      const { tools } = await client.listTools();
      const { prompts } = await client.listPrompts();
      assert.equal(tools.length, 1);
      assert.equal(prompts.length, 1);
    });
  });
});
