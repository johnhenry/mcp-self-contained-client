import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { MCPSelfContainedClient, ResourceTemplate } from "../index.mjs";

describe("ResourceTemplate", () => {
  test("constructor extracts keys", () => {
    const template = new ResourceTemplate("user://{userId}/posts/{postId}");
    assert.deepEqual(template.keys, ["userId", "postId"]);
    assert.equal(template.pattern, "user://{userId}/posts/{postId}");
  });

  test("constructor with options", () => {
    const template = new ResourceTemplate("echo://{message}", {
      name: "Echo Resource",
      description: "Echoes messages",
      mimeType: "text/plain",
    });
    assert.equal(template.name, "Echo Resource");
    assert.equal(template.description, "Echoes messages");
    assert.equal(template.mimeType, "text/plain");
  });

  test("match extracts parameters", () => {
    const template = new ResourceTemplate("echo://{message}");
    const url = new URL("echo://hello-world");
    const params = template.match(url);

    assert.equal(params.message, "hello-world");
  });

  test("match with multiple parameters", () => {
    const template = new ResourceTemplate("api://{version}/users/{id}");
    const url = new URL("api://v1/users/123");
    const params = template.match(url);

    assert.equal(params.version, "v1");
    assert.equal(params.id, "123");
  });

  test("match returns null for non-matching URI", () => {
    const template = new ResourceTemplate("echo://{message}");
    const url = new URL("different://protocol");
    const params = template.match(url);

    assert.equal(params, null);
  });

  test("fill creates URL from parameters", () => {
    const template = new ResourceTemplate("echo://{message}");
    const url = template.fill({ message: "hello world" });

    assert.equal(url.href, "echo://hello%20world");
  });

  test("fill with multiple parameters", () => {
    const template = new ResourceTemplate("api://{version}/users/{id}");
    const url = template.fill({ version: "v2", id: "456" });

    assert.equal(url.href, "api://v2/users/456");
  });

  test("fill properly encodes parameters", () => {
    const template = new ResourceTemplate("data://{content}");
    const url = template.fill({ content: "hello/world?test=1" });

    assert.equal(url.href, "data://hello%2Fworld%3Ftest%3D1");
  });
});

describe("MCPSelfContainedClient Resources", () => {
  test("register and read resource without schema", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "echo-resource",
      new ResourceTemplate("echo://{message}"),
      async (uri, { message }) => ({
        contents: [{ uri: uri.href, text: `Echoed: ${message}` }],
      })
    );

    const result = await client.readResource({
      uri: "echo://hello",
    });

    assert.deepEqual(result, {
      contents: [{ uri: "echo://hello", text: "Echoed: hello" }],
    });
  });

  test("register resource with options", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "echo-resource",
      new ResourceTemplate("echo://{message}"),
      { description: "Echo service", mimeType: "text/plain" },
      async (uri, { message }) => ({
        contents: [{ uri: uri.href, text: `Echoed: ${message}` }],
      })
    );

    const { resources } = await client.listResources();
    assert.equal(resources[0].description, "Echo service");
    assert.equal(resources[0].mimeType, "text/plain");
  });

  test("register and read resource with schema", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const schema = z.object({
      id: z.string().regex(/^\d+$/),
    });

    client.resource(
      "user-resource",
      new ResourceTemplate("user://{id}"),
      schema,
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User ID: ${id}` }],
      })
    );

    const result = await client.readResource({
      uri: "user://123",
    });

    assert.deepEqual(result, {
      contents: [{ uri: "user://123", text: "User ID: 123" }],
    });
  });

  test("resource with invalid schema throws", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const schema = z.object({
      id: z.string().regex(/^\d+$/),
    });

    client.resource(
      "user-resource",
      new ResourceTemplate("user://{id}"),
      schema,
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User ID: ${id}` }],
      })
    );

    await assert.rejects(
      client.readResource({
        uri: "user://not-a-number",
      }),
      /Invalid/
    );
  });

  test("read non-matching resource throws", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "echo-resource",
      new ResourceTemplate("echo://{message}"),
      async () => ({ contents: [] })
    );

    await assert.rejects(
      client.readResource({
        uri: "different://protocol",
      }),
      /No resource matches URI/
    );
  });

  test("resource with blob content", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "data",
      new ResourceTemplate("data://{id}"),
      async (uri, { id }) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/octet-stream",
            blob: Buffer.from(`Data for ${id}`).toString("base64"),
          },
        ],
      })
    );

    const result = await client.readResource({ uri: "data://test" });
    assert.equal(
      result.contents[0].blob,
      Buffer.from("Data for test").toString("base64")
    );
    assert.equal(result.contents[0].mimeType, "application/octet-stream");
  });

  test("multiple resources with different patterns", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "echo",
      new ResourceTemplate("echo://{message}"),
      async (uri, { message }) => ({
        contents: [{ uri: uri.href, text: `Echo: ${message}` }],
      })
    );

    client.resource(
      "user",
      new ResourceTemplate("user://{id}"),
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User: ${id}` }],
      })
    );

    const echoResult = await client.readResource({ uri: "echo://test" });
    assert.equal(echoResult.contents[0].text, "Echo: test");

    const userResult = await client.readResource({ uri: "user://123" });
    assert.equal(userResult.contents[0].text, "User: 123");
  });

  test("resource with complex URI pattern", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "api",
      new ResourceTemplate("api://{version}/users/{userId}/posts/{postId}"),
      async (uri, params) => ({
        contents: [
          {
            uri: uri.href,
            text: `API v${params.version}: User ${params.userId}, Post ${params.postId}`,
          },
        ],
      })
    );

    const result = await client.readResource({
      uri: "api://v2/users/100/posts/5",
    });

    assert.equal(result.contents[0].text, "API vv2: User 100, Post 5");
  });

  test("list resources returns proper format", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource("resource1", new ResourceTemplate("r1://{id}"), () => ({
      contents: [],
    }));
    client.resource(
      "resource2",
      new ResourceTemplate("r2://{id}"),
      { description: "Resource 2", mimeType: "text/plain" },
      () => ({ contents: [] })
    );

    const result = await client.listResources();
    assert.ok(result.resources);
    assert.equal(result.resources.length, 2);
    assert.equal(result.resources[0].name, "resource1");
    assert.equal(result.resources[0].uri, "r1://{id}");
    assert.equal(result.resources[1].name, "resource2");
    assert.equal(result.resources[1].description, "Resource 2");
    assert.equal(result.resources[1].mimeType, "text/plain");
  });

  test("list resource templates", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "resource1",
      new ResourceTemplate("template://{param}", {
        name: "Template 1",
        description: "First template",
        mimeType: "application/json",
      }),
      () => ({ contents: [] })
    );

    const result = await client.listResourceTemplates();
    assert.ok(result.resourceTemplates);
    assert.equal(result.resourceTemplates.length, 1);
    assert.equal(result.resourceTemplates[0].uriTemplate, "template://{param}");
    assert.equal(result.resourceTemplates[0].name, "resource1");
  });

  test("delete resource", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource("temp", new ResourceTemplate("temp://{id}"), () => ({
      contents: [],
    }));
    let { resources } = await client.listResources();
    assert.equal(resources.length, 1);

    client.deleteResource("temp");
    ({ resources } = await client.listResources());
    assert.equal(resources.length, 0);

    await assert.rejects(
      client.readResource({ uri: "temp://123" }),
      /No resource matches URI/
    );
  });

  test("resource handler error handling", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "failing",
      new ResourceTemplate("fail://{id}"),
      async () => {
        throw new Error("Resource handler failed");
      }
    );

    await assert.rejects(
      client.readResource({ uri: "fail://test" }),
      /Resource handler failed/
    );
  });

  test("resource handler with invalid return format throws", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "invalid",
      new ResourceTemplate("invalid://{id}"),
      async () => ({
        // Missing 'contents' array
        text: "invalid",
      })
    );

    await assert.rejects(
      client.readResource({ uri: "invalid://test" }),
      /Resource handler must return/
    );
  });
});
