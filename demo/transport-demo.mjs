#!/usr/bin/env node

/**
 * Demo showing how to use MCPSelfContainedClient with transports
 * This demonstrates using the SDK's Client to connect to our server
 */

import { MCPSelfContainedClient } from '../index.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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

  // Create the SDK client
  const client = new Client({
    name: 'DemoClient',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  // Set up notification listener
  client.onNotification = (notification) => {
    console.log(`📡 Notification: ${notification.method}`, notification.params);
  };

  // Connect both sides
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  console.log('🔌 Connected client and server via in-memory transport\n');

  // The SDK client handles initialization automatically
  console.log('✅ Initialization complete\n');

  // List available tools
  console.log('🔧 Available tools:');
  const tools = await client.listTools();
  tools.tools.forEach(tool => {
    console.log(`  - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
  });

  // Call a tool
  console.log('\n📌 Calling greet tool...');
  const greetResult = await client.callTool({
    name: 'greet',
    arguments: { name: 'Alice' }
  });
  console.log('Result:', greetResult.content[0].text);

  // Call calculate tool
  console.log('\n📌 Calling calculate tool...');
  const calcResult = await client.callTool({
    name: 'calculate',
    arguments: { expression: '6 * 7' }
  });
  console.log('Result:', calcResult.content[0].text);

  // List prompts
  console.log('\n💭 Available prompts:');
  const prompts = await client.listPrompts();
  prompts.prompts.forEach(prompt => {
    console.log(`  - ${prompt.name}${prompt.description ? `: ${prompt.description}` : ''}`);
  });

  // Get a prompt
  console.log('\n📌 Getting story-starter prompt...');
  const promptResult = await client.getPrompt({
    name: 'story-starter',
    arguments: { genre: 'science fiction' }
  });
  console.log('Prompt:', promptResult.messages[0].content.text);

  // List resources
  console.log('\n📂 Available resources:');
  const resources = await client.listResources();
  resources.resources.forEach(resource => {
    console.log(`  - ${resource.name}: ${resource.uri}`);
  });

  // Read a resource
  console.log('\n📌 Reading config resource...');
  const configResult = await client.readResource({
    uri: 'config://app'
  });
  console.log('Config:', configResult.contents[0].text);

  // Subscribe to status resource
  console.log('\n📡 Subscribing to status resource...');
  const subscription = await client.subscribeResource({
    uri: 'status://server'
  });

  // Read initial status
  const statusResult = await client.readResource({
    uri: 'status://server'
  });
  console.log('Initial status:', statusResult.contents[0].text);

  // Wait for some updates
  console.log('\n⏳ Waiting for status updates (10 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Read updated status
  const updatedStatus = await client.readResource({
    uri: 'status://server'
  });
  console.log('\nUpdated status:', updatedStatus.contents[0].text);

  // Unsubscribe
  await client.unsubscribeResource(subscription);
  console.log('\n✅ Unsubscribed from status resource');

  // Close transports
  await client.close();
  console.log('\n👋 Demo completed!');
  process.exit(0);
}

main().catch(console.error);