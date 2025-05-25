import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SelfContainedClient } from '../index.mjs';

describe('SelfContainedClient', () => {
  test('constructor', () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });
    
    assert.equal(client.name, 'test-client');
    assert.equal(client.version, '1.0.0');
  });

  describe('Tools', () => {
    test('register and call tool without schema', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.tool('echo', async ({ message }) => ({
        content: [{ type: 'text', text: `Echo: ${message}` }]
      }));

      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'hello' }
      });

      assert.deepEqual(result, {
        content: [{ type: 'text', text: 'Echo: hello' }]
      });
    });

    test('register and call tool with schema', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({
        a: z.number(),
        b: z.number()
      });

      client.tool('add', schema, async ({ a, b }) => ({
        content: [{ type: 'text', text: `${a + b}` }]
      }));

      const result = await client.callTool({
        name: 'add',
        arguments: { a: 5, b: 3 }
      });

      assert.deepEqual(result, {
        content: [{ type: 'text', text: '8' }]
      });
    });

    test('tool with invalid schema throws', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({
        a: z.number(),
        b: z.number()
      });

      client.tool('add', schema, async ({ a, b }) => ({
        content: [{ type: 'text', text: `${a + b}` }]
      }));

      await assert.rejects(
        client.callTool({
          name: 'add',
          arguments: { a: 'not a number', b: 3 }
        }),
        /Expected number/
      );
    });

    test('call non-existent tool throws', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      await assert.rejects(
        client.callTool({
          name: 'nonexistent',
          arguments: {}
        }),
        /Tool 'nonexistent' not found/
      );
    });

    test('tool with async iterator', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.tool('stream', async function* ({ count }) {
        for (let i = 0; i < count; i++) {
          yield { type: 'text', text: `Item ${i}` };
        }
      });

      const result = await client.callTool({
        name: 'stream',
        arguments: { count: 3 }
      });

      assert.deepEqual(result, {
        content: [
          { type: 'text', text: 'Item 0' },
          { type: 'text', text: 'Item 1' },
          { type: 'text', text: 'Item 2' }
        ]
      });
    });

    test('list tools', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.tool('tool1', () => {});
      client.tool('tool2', z.object({ x: z.string() }), () => {});

      assert.deepEqual(client.listTools(), ['tool1', 'tool2']);
      
      const detailed = client.listTools(true);
      assert.equal(detailed[0].name, 'tool1');
      assert.equal(detailed[0].schema, undefined);
      assert.equal(detailed[1].name, 'tool2');
      assert.ok(detailed[1].schema);
    });

    test('describe tool', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({ x: z.string() });
      client.tool('mytool', schema, () => {});

      const description = client.describeTool('mytool');
      assert.equal(description.name, 'mytool');
      assert.equal(description.schema, schema);
    });

    test('delete tool', async () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.tool('temp', () => ({ content: [] }));
      assert.deepEqual(client.listTools(), ['temp']);

      client.deleteTool('temp');
      assert.deepEqual(client.listTools(), []);

      await assert.rejects(
        client.callTool({ name: 'temp', arguments: {} }),
        /Tool 'temp' not found/
      );
    });
  });

  describe('Prompts', () => {
    test('register and get prompt without schema', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.prompt('greeting', ({ name }) => ({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: `Hello, ${name}!` }
          }
        ]
      }));

      const result = client.getPrompt({
        name: 'greeting',
        arguments: { name: 'Alice' }
      });

      assert.deepEqual(result, {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello, Alice!' }
          }
        ]
      });
    });

    test('register and get prompt with schema', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      client.prompt('intro', schema, ({ name, age }) => ({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: `I'm ${name}, ${age} years old` }
          }
        ]
      }));

      const result = client.getPrompt({
        name: 'intro',
        arguments: { name: 'Bob', age: 25 }
      });

      assert.deepEqual(result, {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: "I'm Bob, 25 years old" }
          }
        ]
      });
    });

    test('prompt with invalid schema throws', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({
        age: z.number()
      });

      client.prompt('age-prompt', schema, ({ age }) => ({
        messages: [{ role: 'user', content: { type: 'text', text: `Age: ${age}` } }]
      }));

      assert.throws(
        () => client.getPrompt({
          name: 'age-prompt',
          arguments: { age: 'not a number' }
        }),
        /Expected number/
      );
    });

    test('get non-existent prompt throws', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      assert.throws(
        () => client.getPrompt({
          name: 'nonexistent',
          arguments: {}
        }),
        /Prompt 'nonexistent' not found/
      );
    });

    test('list prompts', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.prompt('prompt1', () => ({ messages: [] }));
      client.prompt('prompt2', z.object({ x: z.string() }), () => ({ messages: [] }));

      assert.deepEqual(client.listPrompts(), ['prompt1', 'prompt2']);
      
      const detailed = client.listPrompts(true);
      assert.equal(detailed[0].name, 'prompt1');
      assert.equal(detailed[0].schema, undefined);
      assert.equal(detailed[1].name, 'prompt2');
      assert.ok(detailed[1].schema);
    });

    test('describe prompt', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      const schema = z.object({ x: z.string() });
      client.prompt('myprompt', schema, () => ({ messages: [] }));

      const description = client.describePrompt('myprompt');
      assert.equal(description.name, 'myprompt');
      assert.equal(description.schema, schema);
    });

    test('delete prompt', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.prompt('temp', () => ({ messages: [] }));
      assert.deepEqual(client.listPrompts(), ['temp']);

      client.deletePrompt('temp');
      assert.deepEqual(client.listPrompts(), []);

      assert.throws(
        () => client.getPrompt({ name: 'temp', arguments: {} }),
        /Prompt 'temp' not found/
      );
    });
  });

  describe('Namespace deletion', () => {
    test('delete namespace removes all matching entries', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      // Add various entries
      client.tool('math:add', () => {});
      client.tool('math:subtract', () => {});
      client.tool('string:concat', () => {});
      
      client.prompt('math:formula', () => ({ messages: [] }));
      client.prompt('string:template', () => ({ messages: [] }));

      // Verify all exist
      assert.deepEqual(client.listTools().sort(), ['math:add', 'math:subtract', 'string:concat']);
      assert.deepEqual(client.listPrompts().sort(), ['math:formula', 'string:template']);

      // Delete math namespace
      client.deleteNamespace('math');

      // Verify only string entries remain
      assert.deepEqual(client.listTools(), ['string:concat']);
      assert.deepEqual(client.listPrompts(), ['string:template']);
    });

    test('delete namespace with no matches does nothing', () => {
      const client = new SelfContainedClient({
        name: 'test-client',
        version: '1.0.0'
      });

      client.tool('tool1', () => {});
      client.prompt('prompt1', () => ({ messages: [] }));

      client.deleteNamespace('nonexistent');

      assert.deepEqual(client.listTools(), ['tool1']);
      assert.deepEqual(client.listPrompts(), ['prompt1']);
    });
  });
});