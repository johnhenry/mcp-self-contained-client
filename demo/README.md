# MCPSelfContainedClient Demos

This directory contains comprehensive demonstrations of the MCPSelfContainedClient capabilities.

## 🚀 Node.js Demo

A command-line demo that showcases all features of the MCPSelfContainedClient.

### Run the demo:

```bash
npm run demo
```

### Features demonstrated:

- ✅ Declarative configuration
- 🔧 Tool execution with various schemas
- 💬 Prompt generation
- 📁 Resource reading
- 🔄 Streaming tools
- 🗂️ Namespace management
- ❌ Error handling
- 📋 Capability introspection

## 🌐 Visual Browser Demo

An interactive web interface for exploring the MCPSelfContainedClient.

### Run the demo:

Open `demo/index.html` in your browser using any static file server.

### Features:

- **Tools Tab**: Execute built-in tools and add custom tools dynamically
- **Prompts Tab**: Generate prompts with different parameters
- **Resources Tab**:
  - Read resources by URI
  - View all available resources with their patterns
  - Click example URIs to instantly test them
  - Add custom resources with dynamic patterns
  - Supports both static (no parameters) and dynamic (with parameters) resources
- **Capabilities Tab**: View all registered tools, prompts, and resources

### Interactive Features:

- 🎯 Select and execute tools with custom inputs
- ➕ Add new tools on the fly with custom handlers
- 📝 Generate email and story prompts
- 🔍 Read documentation and data resources
- 🔄 Real-time capability updates

## 📖 Demo Code Structure

- `demo.mjs` - Node.js command-line demo
- `index.html` - Visual browser demo (self-contained)

Both demos use the same MCPSelfContainedClient library and demonstrate both declarative and imperative APIs.

### Resource Examples in the Browser Demo

The browser demo includes several resource types:

- **Static Resources**: `static://about` - Fixed content with no parameters
- **Dynamic Resources**:
  - `docs://{topic}` - Documentation pages (try: docs://intro, docs://api)
  - `data://{type}/{id}` - Data resources (try: data://user/123)
  - `file://{path}` - File simulation (try: file://readme.txt)
  - `api://{version}/endpoints/{endpoint}` - API docs (try: api://v1/endpoints/users)
