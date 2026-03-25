export interface ToolExtensionInfo {
  id: string;
  path: string;
  name: string;
  description: string;
}

export interface ExtensionsConfig {
  enabled: string[];
}
