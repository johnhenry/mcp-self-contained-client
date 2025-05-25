import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SelfContainedClient, ResourceTemplate } from '../index.mjs';

describe('ResourceTemplate', () => {
  test('constructor extracts keys', () => {
    const template = new ResourceTemplate('user://{userId}/posts/{postId}');
    assert.deepEqual(template.keys, ['userId', 'postId']);
    assert.equal(template.pattern, 'user://{userId}/posts/{postId}');
  });

  test('match extracts parameters', () => {
    const template = new ResourceTemplate('echo://{message}');
    const url = new URL('echo://hello-world');
    const params = template.match(url);
    
    assert.equal(params.message, 'hello-world');
  });

  test('match with multiple parameters', () => {
    const template = new ResourceTemplate('api://{version}/users/{id}');
    const url = new URL('api://v1/users/123');
    const params = template.match(url);
    
    assert.equal(params.version, 'v1');
    assert.equal(params.id, '123');
  });

  test('match returns null for non-matching URI', () => {
    const template = new ResourceTemplate('echo://{message}');
    const url = new URL('different://protocol');
    const params = template.match(url);
    
    assert.equal(params, null);
  });

  test('fill creates URL from parameters', () => {
    const template = new ResourceTemplate('echo://{message}');
    const url = template.fill({ message: 'hello world' });
    
    assert.equal(url.href, 'echo://hello%20world');
  });

  test('fill with multiple parameters', () => {
    const template = new ResourceTemplate('api://{version}/users/{id}');
    const url = template.fill({ version: 'v2', id: '456' });
    
    assert.equal(url.href, 'api://v2/users/456');
  });

  test('fill properly encodes parameters', () => {
    const template = new ResourceTemplate('data://{content}');
    const url = template.fill({ content: 'hello/world?test=1' });
    
    assert.equal(url.href, 'data://hello%2Fworld%3Ftest%3D1');
  });
});

describe('SelfContainedClient Resources', () => {
  test('register and read resource without schema', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource(
      'echo-resource',
      new ResourceTemplate('echo://{message}'),
      async (uri, { message }) => ({
        contents: [{ uri: uri.href, text: `Echoed: ${message}` }]
      })
    );

    const result = await client.readResource({
      uri: 'echo://hello'
    });

    assert.deepEqual(result, {
      contents: [{ uri: 'echo://hello', text: 'Echoed: hello' }]
    });
  });

  test('register and read resource with schema', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    const schema = z.object({
      id: z.string().regex(/^\d+$/)
    });

    client.resource(
      'user-resource',
      new ResourceTemplate('user://{id}'),
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User ID: ${id}` }]
      }),
      schema
    );

    const result = await client.readResource({
      uri: 'user://123'
    });

    assert.deepEqual(result, {
      contents: [{ uri: 'user://123', text: 'User ID: 123' }]
    });
  });

  test('resource with invalid schema throws', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    const schema = z.object({
      id: z.string().regex(/^\d+$/)
    });

    client.resource(
      'user-resource',
      new ResourceTemplate('user://{id}'),
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User ID: ${id}` }]
      }),
      schema
    );

    await assert.rejects(
      client.readResource({
        uri: 'user://not-a-number'
      }),
      /Invalid/
    );
  });

  test('read non-matching resource throws', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource(
      'echo-resource',
      new ResourceTemplate('echo://{message}'),
      async () => ({ contents: [] })
    );

    await assert.rejects(
      client.readResource({
        uri: 'different://protocol'
      }),
      /No resource matches URI/
    );
  });

  test('multiple resources with different patterns', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource(
      'echo',
      new ResourceTemplate('echo://{message}'),
      async (uri, { message }) => ({
        contents: [{ uri: uri.href, text: `Echo: ${message}` }]
      })
    );

    client.resource(
      'user',
      new ResourceTemplate('user://{id}'),
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `User: ${id}` }]
      })
    );

    const echoResult = await client.readResource({ uri: 'echo://test' });
    assert.equal(echoResult.contents[0].text, 'Echo: test');

    const userResult = await client.readResource({ uri: 'user://123' });
    assert.equal(userResult.contents[0].text, 'User: 123');
  });

  test('resource with complex URI pattern', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource(
      'api',
      new ResourceTemplate('api://{version}/users/{userId}/posts/{postId}'),
      async (uri, params) => ({
        contents: [{
          uri: uri.href,
          text: `API v${params.version}: User ${params.userId}, Post ${params.postId}`
        }]
      })
    );

    const result = await client.readResource({
      uri: 'api://v2/users/100/posts/5'
    });

    assert.equal(
      result.contents[0].text,
      'API vv2: User 100, Post 5'
    );
  });

  test('list resources', () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource('resource1', new ResourceTemplate('r1://{id}'), () => {});
    client.resource('resource2', new ResourceTemplate('r2://{id}'), () => {}, z.object({ id: z.string() }));

    assert.deepEqual(client.listResources(), ['resource1', 'resource2']);
    
    const detailed = client.listResources(true);
    assert.equal(detailed[0].name, 'resource1');
    assert.equal(detailed[0].schema, undefined);
    assert.equal(detailed[1].name, 'resource2');
    assert.ok(detailed[1].schema);
  });

  test('describe resource', () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    const schema = z.object({ id: z.string() });
    const template = new ResourceTemplate('res://{id}');
    client.resource('myresource', template, () => {}, schema);

    const description = client.describeResource('myresource');
    assert.equal(description.name, 'myresource');
    assert.equal(description.schema, schema);
  });

  test('delete resource', async () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    client.resource('temp', new ResourceTemplate('temp://{id}'), () => ({ contents: [] }));
    assert.deepEqual(client.listResources(), ['temp']);

    client.deleteResource('temp');
    assert.deepEqual(client.listResources(), []);

    await assert.rejects(
      client.readResource({ uri: 'temp://123' }),
      /No resource matches URI/
    );
  });

  test('describe non-existent resource throws', () => {
    const client = new SelfContainedClient({
      name: 'test-client',
      version: '1.0.0'
    });

    assert.throws(
      () => client.describeResource('nonexistent'),
      /Resource 'nonexistent' not found/
    );
  });
});