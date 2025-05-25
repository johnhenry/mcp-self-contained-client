# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a self-contained Model Context Protocol (MCP) client implementation that operates entirely in-memory without requiring an external server. It allows dynamic definition and management of tools, prompts, and resources locally.

## Key Architecture

The codebase consists of:

- `index.mjs`: Core JavaScript implementation with JSDoc type annotations providing the MCP client with tool execution, prompt generation, and resource resolution capabilities
- `types.d.ts`: TypeScript type definitions for the client, handlers, and entries

The client uses a Map-based storage system for tools, prompts, and resources, allowing dynamic registration and deletion at runtime.

## Development Commands

Currently, the project has minimal build infrastructure:

- No test suite is configured (package.json shows "Error: no test specified")
- No linting or type-checking commands are defined
- The project uses ES modules (`"type": "module"`)
- Main entry point is `index.mjs`

## Dependencies

- **zod** (devDependency): Used for optional runtime validation of tool/prompt/resource arguments

## Key Implementation Details

The `MCPSelfContainedClient` class provides:

- Tool registration via `tool()` method with optional Zod schema validation
- Prompt registration via `prompt()` method
- Resource registration via `resource()` method using URI templates
- Full introspection capabilities (`describeTool`, `listTools`, etc.)
- Namespace-based deletion support
- Async/streaming support for tool outputs

The `ResourceTemplate` class handles URI pattern matching and parameter extraction for resource handlers.

### Recent Improvements

- **Shared Registration Logic**: All registration methods (`tool`, `prompt`, `resource`) use a common `normalizeEntry` helper to reduce code duplication
- **Consistent Result Validation**: Dedicated validation functions ensure all handlers return properly formatted results
- **Schema Introspection**: Avoids using Zod's internal `_def` property, instead checking for `toJSON()` method or returning a minimal schema indicator
- **URI Encoding Options**: ResourceTemplate's `fill()` method now supports an optional `preserveSlashes` parameter for cases where slashes should be preserved in parameter values
- **Enhanced Error Handling**: All validation errors provide clear, consistent error messages
- **Declarative Configuration**: Constructor now accepts an optional second parameter for declarative configuration of tools, prompts, and resources using array-based syntax similar to mcp-declarative-server
