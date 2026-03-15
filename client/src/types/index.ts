export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type ChartType = "flowchart" | "erd" | "swimlane" | "mindmap" | "sequence";

export interface Chart {
  id: string;
  projectId: string;
  title: string;
  description: string;
  audience: string;
  chartType: ChartType;
  status: "draft" | "review" | "final";
  settingsJson?: string;
  createdAt: string;
  updatedAt: string;
}

export type NodeType =
  | "start"
  | "end"
  | "process"
  | "decision"
  | "input_output"
  | "data_store"
  | "external_system"
  | "note"
  | "subflow_ref"
  | "image"
  | "entity"    // ERD
  | "action"    // Swimlane
  | "central_topic"  // Mind Map
  | "main_branch"    // Mind Map
  | "sub_branch"     // Mind Map
  | "leaf"           // Mind Map
  | "actor"               // Sequence
  | "participant"         // Sequence
  | "lifeline_activation" // Sequence
  | "sticky_note";

export interface FlowNode {
  id: string;
  chartId: string;
  type: NodeType;
  label: string;
  description: string;
  positionX: number;
  positionY: number;
  styleJson: string;
  sourceRefId: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export type EdgeType =
  | "default" | "conditional" | "error" | "async" | "fallback"
  | "one_to_one" | "one_to_many" | "many_to_many"  // ERD
  | "branch"  // Mind Map
  | "sync_message" | "async_message" | "return_message" | "self_message";  // Sequence

export interface FlowEdge {
  id: string;
  chartId: string;
  fromNodeId: string;
  toNodeId: string;
  type: EdgeType;
  label: string;
  condition: string;
  sourceRefId: string | null;
  confidence: number;
  orderIndex?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowGroup {
  id: string;
  chartId: string;
  label: string;
  description: string;
  color: string;
  styleJson: string;
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SourceReference {
  id: string;
  chartId: string;
  type: "file" | "document" | "user_instruction" | "inferred";
  filePath: string;
  lineStart: number | null;
  lineEnd: number | null;
  documentSection: string;
  contentSnippet: string;
  confidence: number;
  createdAt: string;
}

export interface SourceMaterial {
  id: string;
  projectId: string;
  name: string;
  content: string;
  type: "code" | "document" | "url" | "paste";
  createdAt: string;
}

export interface Revision {
  id: string;
  chartId: string;
  snapshotJson: string;
  description: string;
  createdAt: string;
}

export interface Annotation {
  id: string;
  chartId: string;
  nodeId: string | null;
  edgeId: string | null;
  content: string;
  createdAt: string;
}

export interface ValidationIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface LLMSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
}

export type MessageSegment =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCall };

export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  segments?: MessageSegment[];
  attachments?: ChatAttachment[];
  timestamp: string;
}

export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  undoDesc: string;
  redoDesc: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  tools?: Array<{ name: string; description?: string }> | null;
  connectionError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "approved" | "rejected" | "executed";
}
