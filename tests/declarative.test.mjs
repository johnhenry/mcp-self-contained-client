import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SelfContainedClient } from '../index.mjs';

describe('Declarative Configuration', () => {
  test('constructor with declarative tools', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {
      tools: [
        // Simple tool with just handler
        ['simple', async () => ({ content: [{ type: 'text', text: 'simple result' }] })],
        
        // Tool with schema
        ['with-schema', { x: 'number' }, async ({ x }) => ({ 
          content: [{ type: 'text', text: `x is ${x}` }] 
        })],
        
        // Tool with Zod schema and description
        ['with-zod', z.object({ y: z.string() }), async ({ y }) => ({
          content: [{ type: 'text', text: `y is ${y}` }]
        }), 'A tool with Zod validation'],
      ]
    });

    // Verify tools were registered
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    assert.equal(tools[0].name, 'simple');
    assert.equal(tools[1].name, 'with-schema');
    assert.equal(tools[2].name, 'with-zod');
    assert.equal(tools[2].description, 'A tool with Zod validation');

    // Verify tools work
    const result1 = await client.callTool({ name: 'simple' });
    assert.equal(result1.content[0].text, 'simple result');

    const result2 = await client.callTool({ name: 'with-schema', arguments: { x: 42 } });
    assert.equal(result2.content[0].text, 'x is 42');

    const result3 = await client.callTool({ name: 'with-zod', arguments: { y: 'test' } });
    assert.equal(result3.content[0].text, 'y is test');
  });

  test('constructor with declarative prompts', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {
      prompts: [
        // Simple prompt
        ['greeting', ({ name }) => ({
          messages: [{ role: 'user', content: { type: 'text', text: `Hello ${name}` } }]
        })],
        
        // Prompt with schema and description
        ['formal-greeting', { name: 'string', title: 'string' }, ({ name, title }) => ({
          messages: [{ 
            role: 'user', 
            content: { type: 'text', text: `Greetings, ${title} ${name}` } 
          }]
        }), 'A formal greeting prompt'],
      ]
    });

    // Verify prompts were registered
    const { prompts } = await client.listPrompts();
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0].name, 'greeting');
    assert.equal(prompts[1].name, 'formal-greeting');
    assert.equal(prompts[1].description, 'A formal greeting prompt');
    assert.ok(prompts[1].arguments);
    assert.equal(prompts[1].arguments.length, 2);

    // Verify prompts work
    const result1 = await client.getPrompt({ name: 'greeting', arguments: { name: 'Alice' } });
    assert.equal(result1.messages[0].content.text, 'Hello Alice');

    const result2 = await client.getPrompt({ 
      name: 'formal-greeting', 
      arguments: { name: 'Smith', title: 'Dr.' } 
    });
    assert.equal(result2.messages[0].content.text, 'Greetings, Dr. Smith');
  });

  test('constructor with declarative resources', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {
      resources: [
        // Simple resource
        ['echo', 'echo://{message}', async (uri, { message }) => ({
          contents: [{ uri: uri.href, text: `Echo: ${message}` }]
        })],
        
        // Resource with options
        ['docs', 'docs://{page}', async (uri, { page }) => ({
          contents: [{ uri: uri.href, text: `Documentation for ${page}` }]
        }), { description: 'Documentation pages', mimeType: 'text/markdown' }],
        
        // Resource with schema
        ['user', 'user://{id}', z.object({ id: z.string().regex(/^\d+$/) }), 
        async (uri, { id }) => ({
          contents: [{ uri: uri.href, text: `User ID: ${id}` }]
        })],
      ]
    });

    // Verify resources were registered
    const { resources } = await client.listResources();
    assert.equal(resources.length, 3);
    assert.equal(resources[0].name, 'echo');
    assert.equal(resources[1].name, 'docs');
    assert.equal(resources[1].description, 'Documentation pages');
    assert.equal(resources[1].mimeType, 'text/markdown');

    // Verify resources work
    const result1 = await client.readResource({ uri: 'echo://hello' });
    assert.equal(result1.contents[0].text, 'Echo: hello');

    const result2 = await client.readResource({ uri: 'docs://api' });
    assert.equal(result2.contents[0].text, 'Documentation for api');

    const result3 = await client.readResource({ uri: 'user://123' });
    assert.equal(result3.contents[0].text, 'User ID: 123');
  });

  test('constructor with mixed declarative and imperative registration', async () => {
    // Create client with declarative config
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {
      tools: [
        ['declarative-tool', async () => ({ content: [{ type: 'text', text: 'declarative' }] })]
      ]
    });

    // Add imperative tool
    client.tool('imperative-tool', async () => ({ 
      content: [{ type: 'text', text: 'imperative' }] 
    }));

    // Verify both tools exist
    const { tools } = await client.listTools();
    assert.equal(tools.length, 2);
    
    const toolNames = tools.map(t => t.name).sort();
    assert.deepEqual(toolNames, ['declarative-tool', 'imperative-tool']);

    // Verify both work
    const result1 = await client.callTool({ name: 'declarative-tool' });
    assert.equal(result1.content[0].text, 'declarative');

    const result2 = await client.callTool({ name: 'imperative-tool' });
    assert.equal(result2.content[0].text, 'imperative');
  });

  test('empty declarative config', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {});

    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    const { resources } = await client.listResources();

    assert.equal(tools.length, 0);
    assert.equal(prompts.length, 0);
    assert.equal(resources.length, 0);
  });

  test('declarative config with validation errors', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    }, {
      tools: [
        ['strict-tool', z.object({ 
          required: z.string() 
        }), async ({ required }) => ({
          content: [{ type: 'text', text: required }]
        })]
      ]
    });

    // Should fail validation
    const result = await client.callTool({
      name: 'strict-tool',
      arguments: { wrong: 'field' }
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /required/i);
  });
});