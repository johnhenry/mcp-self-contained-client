import { ZodSchema } from "zod";

// Content types
export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type Content = TextContent | ImageContent;

// Tool types
export type ToolResult = {
  content: Content[];
  isError?: boolean;
};

export type ToolHandler = (args: any) => Promise<ToolResult> | ToolResult;

export type Tool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
};

export type ToolEntry = {
  name: string;
  description?: string;
  schema?: ZodSchema;
  handler: ToolHandler;
};

// Resource types
export type Resource = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

export type ResourceContents = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

export type ReadResourceResult = {
  contents: ResourceContents[];
};

export type ResourceHandler = (uri: URL, params: any) => Promise<ReadResourceResult> | ReadResourceResult;

export type ResourceEntry = {
  name: string;
  description?: string;
  schema?: ZodSchema;
  uriTemplate: ResourceTemplate;
  handler: ResourceHandler;
  mimeType?: string;
};

// Prompt types
export type PromptMessage = {
  role: "user" | "assistant" | "system";
  content: Content;
};

export type PromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type Prompt = {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
};

export type GetPromptResult = {
  description?: string;
  messages: PromptMessage[];
};

export type PromptHandler = (args: any) => GetPromptResult;

export type PromptEntry = {
  name: string;
  description?: string;
  schema?: ZodSchema;
  handler: PromptHandler;
  arguments?: PromptArgument[];
};

// ResourceTemplate class
export declare class ResourceTemplate {
  readonly pattern: string;
  readonly keys: string[];
  readonly name?: string;
  readonly description?: string;
  readonly mimeType?: string;
  
  constructor(pattern: string, options?: { name?: string; description?: string; mimeType?: string });
  match(uri: URL): Record<string, string> | null;
  fill(params: Record<string, string>): URL;
}

// Declarative configuration types
export type DeclarativeToolDefinition = 
  | [name: string, handler: ToolHandler]
  | [name: string, schema: Record<string, any> | ZodSchema, handler: ToolHandler]
  | [name: string, schema: Record<string, any> | ZodSchema, handler: ToolHandler, description: string];

export type DeclarativePromptDefinition = 
  | [name: string, handler: PromptHandler]
  | [name: string, schema: Record<string, any> | ZodSchema, handler: PromptHandler]
  | [name: string, schema: Record<string, any> | ZodSchema, handler: PromptHandler, description: string];

export type DeclarativeResourceDefinition = [
  name: string,
  uriPattern: string,
  handler: ResourceHandler,
  options?: { description?: string; mimeType?: string }
] | [
  name: string,
  uriPattern: string,
  schema: Record<string, any> | ZodSchema,
  handler: ResourceHandler,
  options?: { description?: string; mimeType?: string }
];

export type DeclarativeConfig = {
  tools?: DeclarativeToolDefinition[];
  prompts?: DeclarativePromptDefinition[];
  resources?: DeclarativeResourceDefinition[];
};

// Main client class
export declare class SelfContainedClient {
  readonly name: string;
  readonly version: string;
  
  constructor(options: { name: string; version: string }, declarativeConfig?: DeclarativeConfig);
  
  // Tool methods
  tool(name: string, handler: ToolHandler): void;
  tool(name: string, options: { description?: string; inputSchema?: Record<string, any> }, handler: ToolHandler): void;
  tool(name: string, schema: ZodSchema, handler: ToolHandler): void;
  tool(name: string, options: { description?: string; schema?: ZodSchema }, handler: ToolHandler): void;
  
  listTools(): Promise<{ tools: Tool[] }>;
  callTool(params: { name: string; arguments?: any }): Promise<ToolResult>;
  deleteTool(name: string): void;
  
  // Prompt methods
  prompt(name: string, handler: PromptHandler): void;
  prompt(name: string, options: { description?: string; arguments?: PromptArgument[] }, handler: PromptHandler): void;
  prompt(name: string, schema: ZodSchema, handler: PromptHandler): void;
  prompt(name: string, options: { description?: string; schema?: ZodSchema; arguments?: PromptArgument[] }, handler: PromptHandler): void;
  
  listPrompts(): Promise<{ prompts: Prompt[] }>;
  getPrompt(params: { name: string; arguments?: any }): Promise<GetPromptResult>;
  deletePrompt(name: string): void;
  
  // Resource methods
  resource(
    name: string,
    uriTemplate: ResourceTemplate,
    handler: ResourceHandler
  ): void;
  resource(
    name: string,
    uriTemplate: ResourceTemplate,
    options: { description?: string; mimeType?: string },
    handler: ResourceHandler
  ): void;
  resource(
    name: string,
    uriTemplate: ResourceTemplate,
    schema: ZodSchema,
    handler: ResourceHandler
  ): void;
  resource(
    name: string,
    uriTemplate: ResourceTemplate,
    options: { description?: string; mimeType?: string; schema?: ZodSchema },
    handler: ResourceHandler
  ): void;
  
  listResources(): Promise<{ resources: Resource[] }>;
  listResourceTemplates(): Promise<{ resourceTemplates: Array<{ uriTemplate: string; name: string; description?: string; mimeType?: string }> }>;
  readResource(params: { uri: string }): Promise<ReadResourceResult>;
  deleteResource(name: string): void;
  
  // Namespace deletion
  deleteNamespace(prefix: string): void;
  
  // Server info
  getServerCapabilities(): {
    tools?: {};
    prompts?: {};
    resources?: { subscribe?: boolean };
  };
}