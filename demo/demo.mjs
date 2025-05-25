#!/usr/bin/env node

import { SelfContainedClient, ResourceTemplate } from "../index.mjs";
import { z } from "zod";

console.log("🚀 SelfContainedClient Demo\n");

// Create client with declarative configuration
const client = new SelfContainedClient(
  {
    name: "demo-client",
    version: "1.0.0",
  },
  {
    tools: [
      // Simple calculator tools
      [
        "add",
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => ({
          content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }],
        }),
        "Add two numbers",
      ],

      [
        "multiply",
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => ({
          content: [{ type: "text", text: `${a} × ${b} = ${a * b}` }],
        }),
        "Multiply two numbers",
      ],

      // Weather tool (simulated)
      [
        "weather",
        z.object({ city: z.string() }),
        async ({ city }) => ({
          content: [
            {
              type: "text",
              text: `Weather in ${city}: 🌤️ Partly cloudy, 72°F (22°C)`,
            },
          ],
        }),
        "Get weather for a city",
      ],
    ],

    prompts: [
      [
        "greeting",
        z.object({ name: z.string(), language: z.enum(["en", "es", "fr"]) }),
        ({ name, language }) => {
          const greetings = {
            en: `Hello, ${name}!`,
            es: `¡Hola, ${name}!`,
            fr: `Bonjour, ${name}!`,
          };
          return {
            messages: [
              {
                role: "assistant",
                content: { type: "text", text: greetings[language] },
              },
            ],
          };
        },
        "Multilingual greeting prompt",
      ],
    ],

    resources: [
      [
        "config",
        "config://{key}",
        async (uri, { key }) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  key,
                  value:
                    key === "version"
                      ? "1.0.0"
                      : key === "features"
                      ? ["tools", "prompts", "resources"]
                      : "unknown",
                },
                null,
                2
              ),
            },
          ],
        }),
        { description: "Configuration values", mimeType: "application/json" },
      ],
    ],
  }
);

// Add some imperative tools as well
client.tool("echo", async ({ message }) => ({
  content: [{ type: "text", text: `Echo: ${message}` }],
}));

// Streaming tool example
client.tool("countdown", async function* ({ from = 5 }) {
  for (let i = from; i > 0; i--) {
    yield { type: "text", text: `${i}...` };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  yield { type: "text", text: "🚀 Liftoff!" };
});

// Helper function to display results
function displayResult(title, result) {
  console.log(`\n📌 ${title}`);
  console.log("─".repeat(50));
  if (result.content) {
    result.content.forEach((c) => console.log(c.text));
    if (result.isError) console.log("❌ (Error)");
  } else if (result.messages) {
    result.messages.forEach((m) =>
      console.log(`[${m.role}]: ${m.content.text}`)
    );
  } else if (result.contents) {
    result.contents.forEach((c) => {
      console.log(`URI: ${c.uri}`);
      console.log(`Type: ${c.mimeType || "text/plain"}`);
      console.log(`Content:\n${c.text}`);
    });
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

try {
  // 1. List available capabilities
  console.log("📋 Available Capabilities:");
  console.log("─".repeat(50));

  const tools = await client.listTools();
  console.log(
    "\nTools:",
    tools.tools
      .map((t) => `${t.name}${t.description ? ` - ${t.description}` : ""}`)
      .join("\n  ")
  );

  const prompts = await client.listPrompts();
  console.log(
    "\nPrompts:",
    prompts.prompts
      .map((p) => `${p.name}${p.description ? ` - ${p.description}` : ""}`)
      .join("\n  ")
  );

  const resources = await client.listResources();
  console.log(
    "\nResources:",
    resources.resources
      .map(
        (r) =>
          `${r.name} (${r.uri})${r.description ? ` - ${r.description}` : ""}`
      )
      .join("\n  ")
  );

  // 2. Call some tools
  displayResult(
    "Calculator: 15 + 27",
    await client.callTool({ name: "add", arguments: { a: 15, b: 27 } })
  );

  displayResult(
    "Calculator: 6 × 7",
    await client.callTool({ name: "multiply", arguments: { a: 6, b: 7 } })
  );

  displayResult(
    "Weather in San Francisco",
    await client.callTool({
      name: "weather",
      arguments: { city: "San Francisco" },
    })
  );

  displayResult(
    "Echo Test",
    await client.callTool({
      name: "echo",
      arguments: { message: "Hello, MCP!" },
    })
  );

  // 3. Show error handling
  displayResult(
    "Division by Zero (Error Handling)",
    await client.callTool({
      name: "add",
      arguments: { a: "not a number", b: 5 },
    })
  );

  // 4. Use prompts
  displayResult(
    "English Greeting",
    await client.getPrompt({
      name: "greeting",
      arguments: { name: "Alice", language: "en" },
    })
  );

  displayResult(
    "Spanish Greeting",
    await client.getPrompt({
      name: "greeting",
      arguments: { name: "Carlos", language: "es" },
    })
  );

  // 5. ResourceTemplate examples
  console.log("\n📌 ResourceTemplate Examples");
  console.log("─".repeat(50));

  // Create custom ResourceTemplate instances
  const userTemplate = new ResourceTemplate("user://{userId}/profile", {
    name: "User Profile",
    description: "User profile information",
    mimeType: "application/json",
  });

  // Register resource using ResourceTemplate
  client.resource("user-profile", userTemplate, async (uri, { userId }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            id: userId,
            name: `User ${userId}`,
            email: `user${userId}@example.com`,
            created: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  }));

  // Test ResourceTemplate methods
  const testUri = new URL("user://123/profile");
  const params = userTemplate.match(testUri);
  console.log("Template pattern:", userTemplate.pattern);
  console.log("Extracted keys:", userTemplate.keys);
  console.log("Match result:", JSON.stringify(params, null, " "));

  // Fill template with parameters
  const filledUrl = userTemplate.fill({ userId: "456" });
  console.log("Filled URL:", filledUrl.href);

  // Test with special characters and preserveSlashes
  const pathTemplate = new ResourceTemplate("files://{path}");
  const encodedUrl = pathTemplate.fill({ path: "docs/2024/report.pdf" });
  const preservedUrl = pathTemplate.fill(
    { path: "docs/2024/report.pdf" },
    true
  );
  console.log("Encoded path:", encodedUrl.href);
  console.log("Preserved slashes:", preservedUrl.href);

  // Read the user profile resource
  displayResult(
    "User Profile: 123",
    await client.readResource({ uri: "user://123/profile" })
  );

  // 6. Read original resources
  displayResult(
    "Config: version",
    await client.readResource({ uri: "config://version" })
  );

  displayResult(
    "Config: features",
    await client.readResource({ uri: "config://features" })
  );

  // 7. Streaming example
  console.log("\n📌 Countdown (Streaming)");
  console.log("─".repeat(50));
  const countdownResult = await client.callTool({
    name: "countdown",
    arguments: { from: 3 },
  });
  countdownResult.content.forEach((c) => console.log(c.text));

  // 8. Namespace management
  console.log("\n📌 Namespace Management");
  console.log("─".repeat(50));

  // Add namespaced tools
  client.tool("math:sqrt", z.object({ n: z.number() }), async ({ n }) => ({
    content: [{ type: "text", text: `√${n} = ${Math.sqrt(n)}` }],
  }));

  client.tool(
    "math:pow",
    z.object({ base: z.number(), exp: z.number() }),
    async ({ base, exp }) => ({
      content: [
        { type: "text", text: `${base}^${exp} = ${Math.pow(base, exp)}` },
      ],
    })
  );

  console.log("Added math:sqrt and math:pow tools");

  displayResult(
    "Square root of 16",
    await client.callTool({ name: "math:sqrt", arguments: { n: 16 } })
  );

  // Delete namespace
  client.deleteNamespace("math");
  console.log("\nDeleted math: namespace");

  try {
    await client.callTool({ name: "math:sqrt", arguments: { n: 25 } });
  } catch (error) {
    console.log("✅ Expected error:", error.message);
  }

  // 9. Server capabilities
  console.log("\n📌 Server Capabilities");
  console.log("─".repeat(50));
  console.log(JSON.stringify(client.getServerCapabilities(), null, 2));
  console.log("\n✨ Demo completed!\n");
} catch (error) {
  console.error("❌ Demo error:", error);
  process.exit(1);
}
