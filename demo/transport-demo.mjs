#!/usr/bin/env node

/**
 * Demo showing how to use MCPSelfContainedClient with transports
 * This simulates a client-server architecture using in-memory transport
 */

import { MCPSelfContainedClient, InMemoryTransport } from '../index.mjs';

// Create a simple MCP client for testing
class SimpleMCPClient {
  constructor(transport) {
    this.transport = transport;
    this.responses = new Map();
    this._requestId = 0;
    
    // Handle incoming messages
    transport.onmessage = (message) => {
      if ('id' in message && (message.result !== undefined || message.error !== undefined)) {
        // This is a response to our request
        const pending = this.responses.get(message.id);
        if (pending) {
          this.responses.delete(message.id);
          if (message.result !== undefined) {
            pending.resolve(message.result);
          } else {
            pending.reject(new Error(message.error.message));
          }
        }
      } else if ('method' in message && !('id' in message)) {
        // This is a notification
        console.log(`📡 Notification: ${message.method}`, message.params);
      }
    };
  }

  async start() {
    await this.transport.start();
  }

  async request(method, params) {
    const id = ++this._requestId;
    const promise = new Promise((resolve, reject) => {
      this.responses.set(id, { resolve, reject });
    });

    await this.transport.send({
      jsonrpc: '2.0',
      method,
      params,
      id
    });

    return promise;
  }

  async notify(method, params) {
    await this.transport.send({
      jsonrpc: '2.0',
      method,
      params
    });
  }
}

async function main() {
  console.log('🚀 MCP Transport Demo\n');

  // Create linked transport pair
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  
  // Create and configure the server
  const server = new MCPSelfContainedClient({
    name: 'DemoServer',
    version: '1.0.0'
  });

  // Add some tools
  server.tool('greet', async ({ name }) => ({
    content: [{
      type: 'text',
      text: `Hello, ${name}! Welcome to the MCP server.`
    }]
  }));

  server.tool('calculate', async ({ expression }) => {
    try {
      // Simple safe math evaluation
      const result = Function('"use strict"; return (' + expression + ')')();
      return {
        content: [{
          type: 'text',
          text: `Result: ${result}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  // Add a prompt
  server.prompt('story-starter', ({ genre = 'fantasy' }) => ({
    messages: [{
      role: 'assistant',
      content: {
        type: 'text',
        text: `Write a ${genre} story that begins with: "The ancient door creaked open..."` 
      }
    }]
  }));

  // Add some resources
  server.resource('config', 'config://app', async () => ({
    contents: [{
      uri: 'config://app',
      mimeType: 'application/json',
      text: JSON.stringify({
        version: '1.0.0',
        environment: 'demo',
        features: ['tools', 'prompts', 'resources', 'subscriptions']
      }, null, 2)
    }]
  }));

  // Add a live resource with a watcher
  let statusCounter = 0;
  server.resource('status', 'status://server',
    async () => ({
      contents: [{
        uri: 'status://server',
        mimeType: 'application/json',
        text: JSON.stringify({
          uptime: process.uptime(),
          requests: statusCounter,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    }),
    (uri, notifyChange) => {
      // Update status every 3 seconds when subscribed
      const interval = setInterval(() => {
        statusCounter++;
        notifyChange();
      }, 3000);
      
      return () => clearInterval(interval);
    }
  );

  // Create the client
  const client = new SimpleMCPClient(clientTransport);

  // Connect both sides
  await server.connect(serverTransport);
  await client.start();

  console.log('🔌 Connected client and server via in-memory transport\n');

  // Initialize the connection
  console.log('📤 Sending initialize request...');
  const initResult = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'DemoClient',
      version: '1.0.0'
    }
  });
  
  console.log('📥 Server info:', initResult.serverInfo);
  console.log('📥 Server capabilities:', initResult.capabilities);
  
  // Complete initialization
  await client.notify('initialized');
  console.log('✅ Initialization complete\n');

  // List available tools
  console.log('🔧 Available tools:');
  const tools = await client.request('tools/list');
  tools.tools.forEach(tool => {
    console.log(`  - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
  });

  // Call a tool
  console.log('\n📌 Calling greet tool...');
  const greetResult = await client.request('tools/call', {
    name: 'greet',
    arguments: { name: 'Alice' }
  });
  console.log('Result:', greetResult.content[0].text);

  // Call calculate tool
  console.log('\n📌 Calling calculate tool...');
  const calcResult = await client.request('tools/call', {
    name: 'calculate',
    arguments: { expression: '6 * 7' }
  });
  console.log('Result:', calcResult.content[0].text);

  // List prompts
  console.log('\n💭 Available prompts:');
  const prompts = await client.request('prompts/list');
  prompts.prompts.forEach(prompt => {
    console.log(`  - ${prompt.name}${prompt.description ? `: ${prompt.description}` : ''}`);
  });

  // Get a prompt
  console.log('\n📌 Getting story-starter prompt...');
  const promptResult = await client.request('prompts/get', {
    name: 'story-starter',
    arguments: { genre: 'science fiction' }
  });
  console.log('Prompt:', promptResult.messages[0].content.text);

  // List resources
  console.log('\n📂 Available resources:');
  const resources = await client.request('resources/list');
  resources.resources.forEach(resource => {
    console.log(`  - ${resource.name}: ${resource.uri}`);
  });

  // Read a resource
  console.log('\n📌 Reading config resource...');
  const configResult = await client.request('resources/read', {
    uri: 'config://app'
  });
  console.log('Config:', configResult.contents[0].text);

  // Subscribe to status resource
  console.log('\n📡 Subscribing to status resource...');
  const subscription = await client.request('resources/subscribe', {
    uri: 'status://server'
  });
  console.log(`Subscribed with ID: ${subscription.subscriberId}`);

  // Read initial status
  const statusResult = await client.request('resources/read', {
    uri: 'status://server'
  });
  console.log('Initial status:', statusResult.contents[0].text);

  // Wait for some updates
  console.log('\n⏳ Waiting for status updates (10 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Read updated status
  const updatedStatus = await client.request('resources/read', {
    uri: 'status://server'
  });
  console.log('\nUpdated status:', updatedStatus.contents[0].text);

  // Unsubscribe
  await client.request('resources/unsubscribe', {
    uri: 'status://server',
    subscriberId: subscription.subscriberId
  });
  console.log('\n✅ Unsubscribed from status resource');

  // Close transports
  await clientTransport.close();
  console.log('\n👋 Demo completed!');
  process.exit(0);
}

main().catch(console.error);