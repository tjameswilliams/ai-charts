import type {
  Project,
  Chart,
  FlowNode,
  FlowEdge,
  FlowGroup,
  SourceMaterial,
  SourceReference,
  Revision,
  ChatMessage,
  LLMSettings,
  ValidationIssue,
  UndoState,
  McpServerConfig,
} from "../types";

const BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit & { extraHeaders?: Record<string, string> }
): Promise<T> {
  const { extraHeaders, ...fetchOptions } = options || {};
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...extraHeaders },
    ...fetchOptions,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Project>) =>
      request<Project>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
    duplicate: (id: string) =>
      request<Project>(`/projects/${id}/duplicate`, { method: "POST" }),
  },

  charts: {
    list: (projectId: string) =>
      request<Chart[]>(`/projects/${projectId}/charts`),
    get: (id: string) => request<Chart>(`/charts/${id}`),
    create: (projectId: string, data: Partial<Chart>) =>
      request<Chart>(`/projects/${projectId}/charts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Chart>) =>
      request<Chart>(`/charts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/charts/${id}`, { method: "DELETE" }),
    duplicate: (id: string) =>
      request<Chart>(`/charts/${id}/duplicate`, { method: "POST" }),
  },

  nodes: {
    list: (chartId: string) =>
      request<FlowNode[]>(`/charts/${chartId}/nodes`),
    get: (id: string) => request<FlowNode>(`/nodes/${id}`),
    create: (chartId: string, data: Partial<FlowNode>) =>
      request<FlowNode>(`/charts/${chartId}/nodes`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    batchCreate: (chartId: string, nodes: Partial<FlowNode>[]) =>
      request<FlowNode[]>(`/charts/${chartId}/nodes/batch`, {
        method: "POST",
        body: JSON.stringify({ nodes }),
      }),
    update: (id: string, data: Partial<FlowNode>) =>
      request<FlowNode>(`/nodes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    batchUpdatePositions: (
      positions: Array<{ id: string; positionX: number; positionY: number }>
    ) =>
      request<{ ok: boolean }>(`/nodes/batch-position`, {
        method: "PATCH",
        body: JSON.stringify({ positions }),
      }),
    delete: (id: string, batchId?: string) =>
      request<{ ok: boolean }>(`/nodes/${id}`, {
        method: "DELETE",
        extraHeaders: batchId ? { "X-Batch-Id": batchId } : undefined,
      }),
    batchDelete: (nodeIds: string[], batchId?: string) =>
      request<{ ok: boolean }>(`/nodes/batch-delete`, {
        method: "POST",
        body: JSON.stringify({ nodeIds, batchId }),
      }),
  },

  edges: {
    list: (chartId: string) =>
      request<FlowEdge[]>(`/charts/${chartId}/edges`),
    create: (chartId: string, data: Partial<FlowEdge>) =>
      request<FlowEdge>(`/charts/${chartId}/edges`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    batchCreate: (chartId: string, edges: Partial<FlowEdge>[]) =>
      request<FlowEdge[]>(`/charts/${chartId}/edges/batch`, {
        method: "POST",
        body: JSON.stringify({ edges }),
      }),
    update: (id: string, data: Partial<FlowEdge>) =>
      request<FlowEdge>(`/edges/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string, batchId?: string) =>
      request<{ ok: boolean }>(`/edges/${id}`, {
        method: "DELETE",
        extraHeaders: batchId ? { "X-Batch-Id": batchId } : undefined,
      }),
    batchDelete: (edgeIds: string[], batchId?: string) =>
      request<{ ok: boolean }>(`/edges/batch-delete`, {
        method: "POST",
        body: JSON.stringify({ edgeIds, batchId }),
      }),
  },

  groups: {
    list: (chartId: string) =>
      request<FlowGroup[]>(`/charts/${chartId}/groups`),
    create: (chartId: string, data: Partial<FlowGroup> & { nodeIds?: string[] }) =>
      request<FlowGroup>(`/charts/${chartId}/groups`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<FlowGroup>) =>
      request<FlowGroup>(`/groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/groups/${id}`, { method: "DELETE" }),
    addNodes: (groupId: string, nodeIds: string[]) =>
      request<{ ok: boolean }>(`/groups/${groupId}/nodes`, {
        method: "POST",
        body: JSON.stringify({ nodeIds }),
      }),
    removeNode: (groupId: string, nodeId: string) =>
      request<{ ok: boolean }>(`/groups/${groupId}/nodes/${nodeId}`, {
        method: "DELETE",
      }),
  },

  sources: {
    listMaterials: (projectId: string) =>
      request<SourceMaterial[]>(`/projects/${projectId}/sources`),
    createMaterial: (projectId: string, data: Partial<SourceMaterial>) =>
      request<SourceMaterial>(`/projects/${projectId}/sources`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteMaterial: (id: string) =>
      request<{ ok: boolean }>(`/sources/${id}`, { method: "DELETE" }),
    listReferences: (chartId: string) =>
      request<SourceReference[]>(`/charts/${chartId}/source-references`),
    createReference: (chartId: string, data: Partial<SourceReference>) =>
      request<SourceReference>(`/charts/${chartId}/source-references`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteReference: (id: string) =>
      request<{ ok: boolean }>(`/source-references/${id}`, { method: "DELETE" }),
  },

  revisions: {
    list: (chartId: string) =>
      request<Revision[]>(`/charts/${chartId}/revisions`),
    create: (chartId: string, description: string) =>
      request<Revision>(`/charts/${chartId}/revisions`, {
        method: "POST",
        body: JSON.stringify({ description }),
      }),
    restore: (id: string) =>
      request<{ ok: boolean }>(`/revisions/${id}/restore`, { method: "POST" }),
  },

  exports: {
    mermaid: (chartId: string) =>
      request<{ format: string; content: string }>(`/charts/${chartId}/export/mermaid`),
    markdown: (chartId: string) =>
      request<{ format: string; content: string }>(`/charts/${chartId}/export/markdown`),
    save: (chartId: string, format: string, content: string) =>
      request<{ id: string }>(`/charts/${chartId}/export`, {
        method: "POST",
        body: JSON.stringify({ format, content }),
      }),
  },

  validation: {
    run: (chartId: string) =>
      request<{ issues: ValidationIssue[]; count: number }>(`/charts/${chartId}/validate`),
  },

  settings: {
    get: () => request<Record<string, string>>("/settings"),
    update: (data: Partial<LLMSettings>) =>
      request<Record<string, string>>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  undo: {
    state: (chartId: string) =>
      request<UndoState>(`/charts/${chartId}/undo-state`),
    undo: (chartId: string) =>
      request<UndoState & { batchId: string | null }>(`/charts/${chartId}/undo`, {
        method: "POST",
      }),
    redo: (chartId: string) =>
      request<UndoState & { batchId: string | null }>(`/charts/${chartId}/redo`, {
        method: "POST",
      }),
  },

  messages: {
    list: (projectId: string) =>
      request<ChatMessage[]>(`/projects/${projectId}/messages`),
    save: (
      projectId: string,
      msg: {
        id: string;
        role: string;
        content: string;
        thinking?: string;
        toolCalls?: unknown[];
        segments?: unknown[];
        createdAt: string;
      }
    ) =>
      request<{ ok: boolean }>(`/projects/${projectId}/messages`, {
        method: "POST",
        body: JSON.stringify(msg),
      }),
    clear: (projectId: string) =>
      request<{ ok: boolean }>(`/projects/${projectId}/messages`, {
        method: "DELETE",
      }),
    deleteAfter: (projectId: string, messageId: string) =>
      request<{ ok: boolean }>(
        `/projects/${projectId}/messages/${messageId}/after`,
        { method: "DELETE" }
      ),
    summarize: (projectId: string) =>
      request<{ summary: string; messageId: string }>(`/chat/summarize`, {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
  },

  mcpServers: {
    list: () => request<McpServerConfig[]>("/mcp-servers"),
    create: (data: Partial<McpServerConfig>) =>
      request<McpServerConfig>("/mcp-servers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<McpServerConfig>) =>
      request<McpServerConfig>(`/mcp-servers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      request<{ success: boolean; tools?: string[]; toolCount?: number; error?: string }>(
        `/mcp-servers/${id}/test`,
        { method: "POST" }
      ),
    reconnect: (id: string) =>
      request<{ success: boolean; error?: string }>(
        `/mcp-servers/${id}/reconnect`,
        { method: "POST" }
      ),
  },

  projectExport: {
    exportProject: async (id: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/projects/${id}/export`);
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    },
    importProject: async (file: File): Promise<{ projectId: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/projects/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    },
    exportChart: async (id: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/charts/${id}/export`);
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    },
    importChart: async (projectId: string, file: File): Promise<{ chartId: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/projects/${projectId}/charts/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    },
  },

  templates: {
    list: () => request<Array<{ id: string; name: string; description: string; chartType: string }>>("/templates"),
    get: (id: string) => request<{ id: string; name: string; description: string; chartType: string; nodes: any[]; edges: any[]; groups?: any[] }>(`/templates/${id}`),
  },

  upload: async (file: File): Promise<{ url: string; filename: string; id: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },
};
