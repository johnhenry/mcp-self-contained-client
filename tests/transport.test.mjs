import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCPSelfContainedClient } from '../index.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Transport Connection', () => {
  test('connect server and client', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    // Connect both sides
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // Server should be ready to receive messages
    assert.strictEqual(server.transport, serverTransport);
  });

  test('tools operations', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    // Add some tools
    server.tool('add', { type: 'object' }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }]
    }));
    
    server.tool('multiply', async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a * b) }]
    }));
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // List tools
    const tools = await client.listTools();
    assert.strictEqual(tools.tools.length, 2);
    assert.strictEqual(tools.tools[0].name, 'add');
    assert.strictEqual(tools.tools[1].name, 'multiply');
    
    // Call a tool
    const result = await client.callTool({
      name: 'multiply',
      arguments: { a: 6, b: 7 }
    });
    assert.strictEqual(result.content[0].text, '42');
  });

  test('prompts operations', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    // Add a prompt
    server.prompt('greeting', ({ name = 'World' }) => ({
      messages: [{
        role: 'assistant',
        content: { type: 'text', text: `Hello, ${name}!` }
      }]
    }));
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // List prompts
    const prompts = await client.listPrompts();
    assert.strictEqual(prompts.prompts.length, 1);
    assert.strictEqual(prompts.prompts[0].name, 'greeting');
    
    // Get prompt
    const result = await client.getPrompt({
      name: 'greeting',
      arguments: { name: 'Alice' }
    });
    assert.strictEqual(result.messages[0].content.text, 'Hello, Alice!');
  });

  test('resources operations', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    // Add resources
    server.resource('static', 'test://static', async () => ({
      contents: [{
        uri: 'test://static',
        text: 'Static content'
      }]
    }));
    
    server.resource('dynamic', 'test://{type}/{id}', async (uri, params) => ({
      contents: [{
        uri: uri.href,
        text: `Type: ${params.type}, ID: ${params.id}`
      }]
    }));
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // List resources
    const resources = await client.listResources();
    assert.strictEqual(resources.resources.length, 2);
    
    // Read static resource
    const staticResult = await client.readResource({
      uri: 'test://static'
    });
    assert.strictEqual(staticResult.contents[0].text, 'Static content');
    
    // Read dynamic resource
    const dynamicResult = await client.readResource({
      uri: 'test://user/123'
    });
    assert.strictEqual(dynamicResult.contents[0].text, 'Type: user, ID: 123');
  });

  test('resource subscriptions with notifications', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    // Track notifications
    const notifications = [];
    
    let notifyChange;
    server.resource('live', 'live://test', 
      async () => ({
        contents: [{
          uri: 'live://test',
          text: `Updated at ${Date.now()}`
        }]
      }),
      (uri, notify) => {
        notifyChange = notify;
        return () => {}; // Return cleanup function
      }
    );
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    // Store original onMessage handler
    let originalOnMessage;
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // Override client transport's onmessage to intercept notifications
    originalOnMessage = clientTransport.onmessage;
    clientTransport.onmessage = (message) => {
      if (message.method && !message.id) {
        // This is a notification
        notifications.push(message);
      }
      // Call original handler
      if (originalOnMessage) {
        originalOnMessage(message);
      }
    };
    
    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Subscribe to resource
    const subscription = await client.subscribeResource({
      uri: 'live://test'
    });
    
    // Wait for watcher to be set up
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Clear notifications
    notifications.length = 0;
    
    // Verify notifyChange was set
    assert.ok(notifyChange, 'notifyChange should be defined');
    
    // Trigger a change
    notifyChange();
    
    // Wait for notification to propagate
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check notification was received
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].method, 'notifications/resources/updated');
    assert.strictEqual(notifications[0].params.uri, 'live://test');
    
    // Unsubscribe
    await client.unsubscribeResource(subscription);
  });

  test('error handling', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer',
      version: '1.0.0'
    });
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // Try to call non-existent tool
    try {
      await client.callTool({
        name: 'non-existent',
        arguments: {}
      });
      assert.fail('Should have thrown error');
    } catch (error) {
      assert(error.message.includes('Tool \'non-existent\' not found'));
    }
  });

  test('server capabilities', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    const server = new MCPSelfContainedClient({
      name: 'TestServer', 
      version: '1.0.0'
    });
    
    const client = new Client({
      name: 'TestClient',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    
    // Get server capabilities from our server
    const capabilities = server.getServerCapabilities();
    assert.deepStrictEqual(capabilities, {
      tools: {},
      prompts: {},
      resources: {
        subscribe: true,
        listChanged: true
      }
    });
  });
});