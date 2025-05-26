/**
 * In-memory transport implementation for testing
 * Based on MCP SDK's InMemoryTransport
 */
export class InMemoryTransport {
  constructor() {
    this._started = false;
    this._otherTransport = null;
    this._queue = [];
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  /**
   * Create a linked pair of transports
   * @returns {[InMemoryTransport, InMemoryTransport]}
   */
  static createLinkedPair() {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();

    transport1._otherTransport = transport2;
    transport2._otherTransport = transport1;

    return [transport1, transport2];
  }

  /**
   * Start the transport
   * @returns {Promise<void>}
   */
  async start() {
    this._started = true;

    // Process any queued messages
    while (this._queue.length > 0) {
      const message = this._queue.shift();
      this._deliver(message);
    }
  }

  /**
   * Send a message
   * @param {import('./types').JSONRPCMessage} message
   * @returns {Promise<void>}
   */
  async send(message) {
    if (!this._otherTransport) {
      throw new Error("Transport not connected");
    }

    if (!this._otherTransport._started) {
      // Queue the message if the other transport hasn't started yet
      this._otherTransport._queue.push(message);
    } else {
      // Deliver immediately
      this._otherTransport._deliver(message);
    }
  }

  /**
   * Close the transport
   * @returns {Promise<void>}
   */
  async close() {
    this._started = false;

    // Notify both sides of closure asynchronously
    setImmediate(() => {
      if (this.onclose) {
        this.onclose();
      }
    });

    // Also notify the other transport
    if (this._otherTransport) {
      setImmediate(() => {
        if (this._otherTransport.onclose) {
          this._otherTransport.onclose();
        }
      });
    }
  }

  /**
   * Deliver a message to the handler
   * @private
   * @param {import('./types').JSONRPCMessage} message
   */
  _deliver(message) {
    // Use setImmediate to ensure async delivery
    setImmediate(() => {
      if (this.onmessage) {
        this.onmessage(message);
      }
    });
  }
}
