import { ZodSchema } from "zod";

export type ToolHandler = (args: any) => any;
export type ResourceHandler = (uri: URL, params: any) => any;
export type PromptHandler = (args: any) => { messages: any[] };

export type ToolEntry = {
  name: string;
  schema?: ZodSchema;
  handler: ToolHandler;
};

export type ResourceEntry = {
  name: string;
  schema?: ZodSchema;
  uriTemplate: ResourceTemplate;
  handler: ResourceHandler;
};

export type PromptEntry = {
  name: string;
  schema?: ZodSchema;
  handler: PromptHandler;
};

export declare class ResourceTemplate {
  readonly pattern: string;
  readonly keys: string[];
  
  constructor(pattern: string);
  match(uri: URL): Record<string, string> | null;
  fill(params: Record<string, string>): URL;
}

export declare class SelfContainedClient {
  readonly name: string;
  readonly version: string;
  
  constructor(options: { name: string; version: string });
  
  tool(name: string, handler: ToolHandler): void;
  tool(name: string, schema: ZodSchema, handler: ToolHandler): void;
  
  prompt(name: string, handler: PromptHandler): void;
  prompt(name: string, schema: ZodSchema, handler: PromptHandler): void;
  
  resource(
    name: string,
    uriTemplate: ResourceTemplate,
    handler: ResourceHandler,
    schema?: ZodSchema
  ): void;
  
  listTools(detailed?: boolean): string[] | { name: string; schema?: ZodSchema }[];
  listPrompts(detailed?: boolean): string[] | { name: string; schema?: ZodSchema }[];
  listResources(detailed?: boolean): string[] | { name: string; schema?: ZodSchema }[];
  
  callTool(params: { name: string; arguments: any }): Promise<any>;
  readResource(params: { uri: string }): Promise<{ contents: { uri: string; text: string }[] }>;
  getPrompt(params: { name: string; arguments: any }): { messages: any[] };
  
  deleteTool(name: string): void;
  deletePrompt(name: string): void;
  deleteResource(name: string): void;
  deleteNamespace(prefix: string): void;
  
  describeTool(name: string): { name: string; schema?: ZodSchema };
  describePrompt(name: string): { name: string; schema?: ZodSchema };
  describeResource(name: string): { name: string; schema?: ZodSchema };
}