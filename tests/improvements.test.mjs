import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { MCPSelfContainedClient, ResourceTemplate } from "../index.mjs";

describe("Improvements", () => {
  describe("Shared validation helpers", () => {
    test("tool result validation catches missing content", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.tool("bad-tool", async () => ({
        // Missing content array
        message: "hello",
      }));

      const result = await client.callTool({ name: "bad-tool" });
      assert.equal(result.isError, true);
      assert.match(
        result.content[0].text,
        /Tool must return { content: Content\[\] }/
      );
    });

    test("prompt result validation catches missing messages", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.prompt("bad-prompt", () => ({
        // Missing messages array
        text: "hello",
      }));

      await assert.rejects(
        client.getPrompt({ name: "bad-prompt" }),
        /Prompt handler must return { messages: PromptMessage\[\] }/
      );
    });

    test("resource result validation catches missing contents", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      client.resource(
        "bad-resource",
        new ResourceTemplate("bad://{id}"),
        async () => ({
          // Missing contents array
          data: "hello",
        })
      );

      await assert.rejects(
        client.readResource({ uri: "bad://test" }),
        /Resource handler must return { contents: ResourceContents\[\] }/
      );
    });
  });

  describe("URI encoding with preserveSlashes option", () => {
    test("fill preserves slashes when option is true", () => {
      const template = new ResourceTemplate("https://example.com/api/{path}");

      // Without preserveSlashes (default)
      const url1 = template.fill({ path: "folder/subfolder/file.txt" });
      assert.equal(
        url1.href,
        "https://example.com/api/folder%2Fsubfolder%2Ffile.txt"
      );

      // With preserveSlashes
      const url2 = template.fill({ path: "folder/subfolder/file.txt" }, true);
      assert.equal(
        url2.href,
        "https://example.com/api/folder/subfolder/file.txt"
      );
    });

    test("fill still encodes other special characters", () => {
      const template = new ResourceTemplate("query://{params}");

      const url = template.fill({ params: "name=John Doe&age=30" }, true);
      assert.equal(url.href, "query://name%3DJohn%20Doe%26age%3D30");
    });
  });

  describe("Schema introspection without _def", () => {
    test("listTools returns minimal schema indicator when toJSON is not available", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const schema = z.object({ x: z.number() });
      client.tool("with-schema", schema, () => ({ content: [] }));

      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "with-schema");

      // Should have some schema indicator
      assert.ok(tool.inputSchema);
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.zodSchema, true);
    });

    test("listTools uses inputSchema if provided directly", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      const jsonSchema = {
        type: "object",
        properties: { x: { type: "number" } },
      };
      client.tool("with-json-schema", { inputSchema: jsonSchema }, () => ({
        content: [],
      }));

      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "with-json-schema");

      assert.deepEqual(tool.inputSchema, jsonSchema);
    });
  });

  describe("Normalized entry helper", () => {
    test("all registration methods handle options consistently", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      // Tool with various option formats
      client.tool("tool1", () => ({ content: [] }));
      client.tool("tool2", { description: "Tool 2" }, () => ({ content: [] }));
      client.tool("tool3", z.object({ x: z.string() }), () => ({
        content: [],
      }));
      client.tool(
        "tool4",
        { description: "Tool 4", schema: z.object({ y: z.number() }) },
        () => ({ content: [] })
      );

      const { tools } = await client.listTools();
      assert.equal(tools.length, 4);
      assert.equal(tools[1].description, "Tool 2");
      assert.equal(tools[3].description, "Tool 4");

      // Prompt with various option formats
      client.prompt("prompt1", () => ({ messages: [] }));
      client.prompt("prompt2", { description: "Prompt 2" }, () => ({
        messages: [],
      }));
      client.prompt("prompt3", z.object({ x: z.string() }), () => ({
        messages: [],
      }));
      client.prompt(
        "prompt4",
        {
          description: "Prompt 4",
          arguments: [{ name: "arg1", required: true }],
        },
        () => ({ messages: [] })
      );

      const { prompts } = await client.listPrompts();
      assert.equal(prompts.length, 4);
      assert.equal(prompts[1].description, "Prompt 2");
      assert.equal(prompts[3].description, "Prompt 4");
      assert.equal(prompts[3].arguments[0].name, "arg1");

      // Resource with various option formats
      const template = new ResourceTemplate("test://{id}");
      client.resource("resource1", template, () => ({ contents: [] }));
      client.resource(
        "resource2",
        template,
        { description: "Resource 2" },
        () => ({ contents: [] })
      );
      client.resource(
        "resource3",
        template,
        z.object({ id: z.string() }),
        () => ({ contents: [] })
      );
      client.resource(
        "resource4",
        template,
        {
          description: "Resource 4",
          mimeType: "text/plain",
        },
        () => ({ contents: [] })
      );

      const { resources } = await client.listResources();
      assert.equal(resources.length, 4);
      assert.equal(resources[1].description, "Resource 2");
      assert.equal(resources[3].description, "Resource 4");
      assert.equal(resources[3].mimeType, "text/plain");
    });
  });

  describe("Error handling improvements", () => {
    test("consistent error messages for invalid results", async () => {
      const client = new MCPSelfContainedClient({
        name: "test-client",
        version: "1.0.0",
      });

      // Tool returning non-object
      client.tool("returns-string", async () => "not an object");
      const result1 = await client.callTool({ name: "returns-string" });
      assert.equal(result1.isError, true);
      assert.match(result1.content[0].text, /Tool must return an object/);

      // Tool returning null
      client.tool("returns-null", async () => null);
      const result2 = await client.callTool({ name: "returns-null" });
      assert.equal(result2.isError, true);
      assert.match(result2.content[0].text, /Tool must return an object/);

      // Prompt returning non-object
      client.prompt("returns-array", () => []);
      await assert.rejects(
        client.getPrompt({ name: "returns-array" }),
        /Prompt handler must return { messages: PromptMessage\[\] }/
      );

      // Resource returning undefined
      client.resource(
        "returns-undefined",
        new ResourceTemplate("test://{id}"),
        async () => undefined
      );
      await assert.rejects(
        client.readResource({ uri: "test://123" }),
        /Resource handler must return an object/
      );
    });
  });
});
