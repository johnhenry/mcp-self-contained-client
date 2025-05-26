import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MCPSelfContainedClient, ResourceTemplate } from "../index.mjs";

describe("Resource Subscriptions", () => {
  test("server capabilities include subscription support", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const capabilities = client.getServerCapabilities();
    assert.equal(capabilities.resources.subscribe, true);
    assert.equal(capabilities.resources.listChanged, true);
  });

  test("subscribe to resource returns subscription ID", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    // Register a resource
    client.resource(
      "test-resource",
      "test://{id}",
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Test content ${id}` }],
      })
    );

    const result = await client.subscribeToResource({ uri: "test://123" });
    assert.ok(result);
    assert.equal(result._meta?.uri, "test://123");

    client.cleanup();
  });

  test("unsubscribe from resource", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "test-resource",
      "test://{id}",
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Test content ${id}` }],
      })
    );

    // Subscribe
    const subscription = await client.subscribeToResource({ uri: "test://123" });
    
    // Verify subscription exists
    let subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 1);
    assert.equal(subscriptions.subscriptions[0].uri, "test://123");
    assert.equal(subscriptions.subscriptions[0].subscriberCount, 1);

    // Unsubscribe
    const result = await client.unsubscribeFromResource(subscription);
    assert.deepEqual(result, {});

    // Verify subscription removed
    subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 0);

    client.cleanup();
  });

  test("multiple subscribers to same resource", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.resource(
      "test-resource",
      "test://{id}",
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Test content ${id}` }],
      })
    );

    // Multiple subscriptions to same resource
    const sub1 = await client.subscribeToResource({ uri: "test://123" });
    const sub2 = await client.subscribeToResource({ uri: "test://123" });
    
    const subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 1);
    assert.equal(subscriptions.subscriptions[0].subscriberCount, 1); // SDK model: one client subscription
    
    // Since SDK manages subscriptions per URI, unsubscribing removes all
    await client.unsubscribeFromResource(sub1);
    
    const remaining = await client.listResourceSubscriptions();
    assert.equal(remaining.subscriptions.length, 0);

    client.cleanup();
  });

  test("resource change notifications", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const notifications = [];
    client.on("notification", (notification) => {
      notifications.push(notification);
    });

    client.resource(
      "test-resource",
      "test://{id}",
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Test content ${id}` }],
      })
    );

    // Clear notifications from resource registration
    notifications.length = 0;

    // Subscribe to resource
    await client.subscribeToResource({ uri: "test://123" });

    // Manually trigger change notification
    client.notifyResourceChanged("test://123");

    // Verify notification was emitted
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].method, "notifications/resources/updated");
    assert.equal(notifications[0].params.uri, "test://123");

    client.cleanup();
  });

  test("resource list change notifications", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const notifications = [];
    client.on("notification", (notification) => {
      notifications.push(notification);
    });

    // Adding a resource should trigger list change notification
    client.resource(
      "new-resource",
      "new://{id}",
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `New content ${id}` }],
      })
    );

    // Verify list change notification was emitted
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].method, "notifications/resources/list_changed");

    client.cleanup();
  });

  test("watcher function integration", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const notifications = [];
    client.on("notification", (notification) => {
      notifications.push(notification);
    });

    let watcherCleanupCalled = false;
    let watcherNotifyFunction = null;

    // Register resource with watcher
    client.resource(
      "watched-resource",
      "watched://{id}",
      { description: "Resource with watcher" },
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Watched content ${id}` }],
      }),
      // Watcher function
      (uri, notifyChange) => {
        watcherNotifyFunction = notifyChange;
        return () => {
          watcherCleanupCalled = true;
        };
      }
    );

    // Clear notifications from resource registration
    notifications.length = 0;

    // Subscribe to resource (should activate watcher)
    await client.subscribeToResource({ uri: "watched://123" });

    // Simulate external change triggering watcher
    assert.ok(watcherNotifyFunction);
    watcherNotifyFunction();

    // Verify notification was emitted
    assert.equal(notifications.length, 1); // 1 for resource update
    const updateNotification = notifications.find(n => 
      n.method === "notifications/resources/updated"
    );
    assert.ok(updateNotification);
    assert.equal(updateNotification.params.uri, "watched://123");

    // Unsubscribe should trigger watcher cleanup
    await client.unsubscribeFromResource({ uri: "watched://123" });
    assert.equal(watcherCleanupCalled, true);

    client.cleanup();
  });

  test("watcher without cleanup function", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    let watcherCalled = false;

    // Register resource with watcher that doesn't return cleanup
    client.resource(
      "simple-watched",
      "simple://{id}",
      { description: "Simple watched resource" },
      async (uri, { id }) => ({
        contents: [{ uri: uri.href, text: `Simple content ${id}` }],
      }),
      (uri, notifyChange) => {
        watcherCalled = true;
        // No cleanup function returned
      }
    );

    // Subscribe should still work
    const result = await client.subscribeToResource({ uri: "simple://123" });
    assert.ok(result);
    assert.equal(result._meta?.uri, "simple://123");
    assert.equal(watcherCalled, true);

    client.cleanup();
  });

  test("subscribe to non-existent resource pattern", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    // Subscribe to URI that doesn't match any registered resource
    const result = await client.subscribeToResource({ uri: "nonexistent://123" });
    
    // Should still succeed (subscription tracks URI, not resource existence)
    assert.ok(result);
    assert.equal(result._meta?.uri, "nonexistent://123");

    const subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 1);
    assert.equal(subscriptions.subscriptions[0].uri, "nonexistent://123");

    client.cleanup();
  });

  test("unsubscribe from non-existent subscription", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    const result = await client.unsubscribeFromResource({ uri: "nonexistent://123" });
    // SDK returns empty object for unsubscribe
    assert.deepEqual(result, {});

    client.cleanup();
  });

  test("cleanup removes all subscriptions and watchers", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    let cleanupCount = 0;

    // Register multiple resources with watchers
    for (let i = 0; i < 3; i++) {
      client.resource(
        `resource-${i}`,
        `test${i}://{id}`,
        { description: `Test resource ${i}` },
        async (uri, { id }) => ({
          contents: [{ uri: uri.href, text: `Content ${i}-${id}` }],
        }),
        (uri, notifyChange) => {
          return () => {
            cleanupCount++;
          };
        }
      );
    }

    // Subscribe to multiple resources
    await client.subscribeToResource({ uri: "test0://123" });
    await client.subscribeToResource({ uri: "test1://456" });
    await client.subscribeToResource({ uri: "test2://789" });

    let subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 3);

    // Cleanup should remove all subscriptions and call all cleanup functions
    client.cleanup();

    subscriptions = await client.listResourceSubscriptions();
    assert.equal(subscriptions.subscriptions.length, 0);
    assert.equal(cleanupCount, 3);
  });

  test("resource watcher called with correct parameters", async () => {
    const client = new MCPSelfContainedClient({
      name: "test-client",
      version: "1.0.0",
    });

    let watcherUri = null;
    let watcherNotifyFunction = null;

    client.resource(
      "param-test",
      "param://{category}/{id}",
      { description: "Parameter test resource" },
      async (uri, params) => ({
        contents: [{ uri: uri.href, text: `${params.category}-${params.id}` }],
      }),
      (uri, notifyChange) => {
        watcherUri = uri;
        watcherNotifyFunction = notifyChange;
      }
    );

    await client.subscribeToResource({ uri: "param://books/123" });

    assert.equal(watcherUri, "param://books/123");
    assert.equal(typeof watcherNotifyFunction, "function");

    client.cleanup();
  });
});