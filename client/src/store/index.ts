import { create } from "zustand";
import { api } from "../api/client";
import type {
  Project,
  Chart,
  FlowNode,
  FlowEdge,
  FlowGroup,
  SourceMaterial,
  Revision,
  ChatMessage,
  ChatAttachment,
  MessageSegment,
  ToolCall,
  ValidationIssue,
} from "../types";
import { nanoid } from "nanoid";

let abortController: AbortController | null = null;

interface AppState {
  // Project
  project: Project | null;
  projects: Project[];
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  exportProject: (id: string) => Promise<void>;
  importProject: (file: File) => Promise<void>;

  // Charts
  charts: Chart[];
  activeChart: Chart | null;
  loadCharts: () => Promise<void>;
  selectChart: (id: string | null) => Promise<void>;
  createChart: (data: Partial<Chart>) => Promise<Chart>;
  updateChart: (id: string, data: Partial<Chart>) => Promise<void>;
  deleteChart: (id: string) => Promise<void>;
  duplicateChart: (id: string) => Promise<void>;
  exportChart: (id: string) => Promise<void>;
  importChart: (file: File) => Promise<void>;

  // Nodes
  nodes: FlowNode[];
  loadNodes: () => Promise<void>;
  createNode: (data: Partial<FlowNode>) => Promise<FlowNode>;
  updateNode: (id: string, data: Partial<FlowNode>) => Promise<void>;
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>;
  batchUpdatePositions: (positions: Array<{ id: string; x: number; y: number }>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;

  // Edges
  edges: FlowEdge[];
  loadEdges: () => Promise<void>;
  createEdge: (data: Partial<FlowEdge>) => Promise<FlowEdge>;
  updateEdge: (id: string, data: Partial<FlowEdge>) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;

  // Groups
  groups: FlowGroup[];
  loadGroups: () => Promise<void>;
  createGroup: (label: string, nodeIds: string[], color?: string) => Promise<FlowGroup>;
  updateGroup: (id: string, data: Partial<FlowGroup>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setGroupNodes: (groupId: string, nodeIds: string[]) => Promise<void>;
  selectedGroupId: string | null;
  selectGroup: (id: string | null) => void;

  // Source Materials
  sourceMaterials: SourceMaterial[];
  loadSourceMaterials: () => Promise<void>;

  // Revisions
  revisions: Revision[];
  loadRevisions: () => Promise<void>;

  // Validation
  validationIssues: ValidationIssue[];
  runValidation: () => Promise<void>;

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: Set<string>;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setSelectedNodeIds: (ids: Set<string>) => void;
  deleteSelectedNodes: () => Promise<void>;

  // Chat
  chatMode: "wizard" | "builder";
  messages: ChatMessage[];
  messagesLoaded: boolean;
  isStreaming: boolean;
  isSummarizing: boolean;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  loadMessages: () => Promise<void>;
  setChatMode: (mode: "wizard" | "builder") => void;
  setIsStreaming: (v: boolean) => void;
  sendChatMessage: (content: string, attachments?: ChatAttachment[]) => Promise<void>;
  stopStreaming: () => void;
  retryLastMessage: () => void;
  restartFromMessage: (messageId: string) => Promise<void>;
  summarizeChat: () => Promise<void>;
  contextStatus: { used: number; total: number } | null;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undoDesc: string;
  redoDesc: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refreshUndoState: () => Promise<void>;

  // Canvas export
  canvasExportFn: ((format: "png" | "svg", crop: boolean, theme: "dark" | "light") => Promise<string>) | null;
  setCanvasExportFn: (fn: ((format: "png" | "svg", crop: boolean, theme: "dark" | "light") => Promise<string>) | null) => void;

  // Full reload
  loadAll: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  // Project
  project: null,
  projects: [],
  loadProjects: async () => {
    const projects = await api.projects.list();
    set({ projects });
  },
  loadProject: async (id: string) => {
    const project = await api.projects.get(id);
    set({ project, messagesLoaded: false, activeChart: null });
    await get().loadAll();
  },
  createProject: async (name: string) => {
    const project = await api.projects.create({ name });
    set({ project, projects: [...get().projects, project] });
    return project;
  },
  updateProject: async (id, data) => {
    const updated = await api.projects.update(id, data);
    set({
      project: updated,
      projects: get().projects.map((p) => (p.id === id ? updated : p)),
    });
  },
  deleteProject: async (id) => {
    await api.projects.delete(id);
    const remaining = get().projects.filter((p) => p.id !== id);
    set({ projects: remaining });
    if (get().project?.id === id) {
      if (remaining.length > 0) {
        await get().loadProject(remaining[0].id);
      } else {
        set({ project: null, charts: [], nodes: [], edges: [], groups: [], activeChart: null });
      }
    }
  },
  duplicateProject: async (id) => {
    const copy = await api.projects.duplicate(id);
    set({ projects: [...get().projects, copy] });
    await get().loadProject(copy.id);
  },
  exportProject: async (id) => {
    const blob = await api.projectExport.exportProject(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-${id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
  importProject: async (file) => {
    const result = await api.projectExport.importProject(file);
    await get().loadProjects();
    await get().loadProject(result.projectId);
  },

  // Charts
  charts: [],
  activeChart: null,
  loadCharts: async () => {
    const p = get().project;
    if (!p) return;
    const charts = await api.charts.list(p.id);
    set({ charts });
    // Auto-select first chart
    if (charts.length > 0 && !get().activeChart) {
      await get().selectChart(charts[0].id);
    }
  },
  selectChart: async (id: string | null) => {
    if (!id) {
      set({ activeChart: null, nodes: [], edges: [], groups: [], canUndo: false, canRedo: false, undoDesc: "", redoDesc: "" });
      return;
    }
    const chart = await api.charts.get(id);
    set({ activeChart: chart });
    await Promise.all([get().loadNodes(), get().loadEdges(), get().loadGroups()]);
    get().refreshUndoState();
  },
  createChart: async (data) => {
    const p = get().project;
    if (!p) throw new Error("No project");
    const chart = await api.charts.create(p.id, data);
    set({ charts: [...get().charts, chart], activeChart: chart });
    return chart;
  },
  updateChart: async (id, data) => {
    const updated = await api.charts.update(id, data);
    set({
      charts: get().charts.map((c) => (c.id === id ? updated : c)),
      activeChart: get().activeChart?.id === id ? updated : get().activeChart,
    });
  },
  deleteChart: async (id) => {
    await api.charts.delete(id);
    const remaining = get().charts.filter((c) => c.id !== id);
    set({ charts: remaining });
    if (get().activeChart?.id === id) {
      if (remaining.length > 0) {
        await get().selectChart(remaining[0].id);
      } else {
        set({ activeChart: null, nodes: [], edges: [], groups: [] });
      }
    }
  },
  duplicateChart: async (id) => {
    const copy = await api.charts.duplicate(id);
    set({ charts: [...get().charts, copy] });
    await get().selectChart(copy.id);
  },
  exportChart: async (id) => {
    const blob = await api.projectExport.exportChart(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-${id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
  importChart: async (file) => {
    const p = get().project;
    if (!p) throw new Error("No project");
    const result = await api.projectExport.importChart(p.id, file);
    await get().loadCharts();
    await get().selectChart(result.chartId);
  },

  // Nodes
  nodes: [],
  loadNodes: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    const nodes = await api.nodes.list(chart.id);
    set({ nodes });
  },
  createNode: async (data) => {
    const chart = get().activeChart;
    if (!chart) throw new Error("No chart");
    const node = await api.nodes.create(chart.id, data);
    set({ nodes: [...get().nodes, node] });
    get().refreshUndoState();
    return node;
  },
  updateNode: async (id, data) => {
    const updated = await api.nodes.update(id, data);
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) });
    get().refreshUndoState();
  },
  updateNodePosition: async (id, x, y) => {
    await api.nodes.update(id, { positionX: x, positionY: y });
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, positionX: x, positionY: y } : n
      ),
    });
    get().refreshUndoState();
  },
  batchUpdatePositions: async (positions) => {
    const apiPositions = positions.map((p) => ({
      id: p.id,
      positionX: p.x,
      positionY: p.y,
    }));
    await api.nodes.batchUpdatePositions(apiPositions);
    set({
      nodes: get().nodes.map((n) => {
        const pos = positions.find((p) => p.id === n.id);
        return pos ? { ...n, positionX: pos.x, positionY: pos.y } : n;
      }),
    });
    get().refreshUndoState();
  },
  deleteNode: async (id) => {
    await api.nodes.delete(id);
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
    get().refreshUndoState();
  },

  // Edges
  edges: [],
  loadEdges: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    const edges = await api.edges.list(chart.id);
    set({ edges });
  },
  createEdge: async (data) => {
    const chart = get().activeChart;
    if (!chart) throw new Error("No chart");
    const edge = await api.edges.create(chart.id, data);
    set({ edges: [...get().edges, edge] });
    get().refreshUndoState();
    return edge;
  },
  updateEdge: async (id, data) => {
    const updated = await api.edges.update(id, data);
    set({ edges: get().edges.map((e) => (e.id === id ? updated : e)) });
    get().refreshUndoState();
  },
  deleteEdge: async (id) => {
    await api.edges.delete(id);
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
    });
    get().refreshUndoState();
  },

  // Groups
  groups: [],
  selectedGroupId: null,
  loadGroups: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    const groups = await api.groups.list(chart.id);
    set({ groups });
  },
  createGroup: async (label, nodeIds, color) => {
    const chart = get().activeChart;
    if (!chart) throw new Error("No chart");
    const group = await api.groups.create(chart.id, { label, color, nodeIds });
    set({ groups: [...get().groups, group] });
    get().refreshUndoState();
    return group;
  },
  updateGroup: async (id, data) => {
    const updated = await api.groups.update(id, data);
    set({ groups: get().groups.map((g) => (g.id === id ? { ...g, ...updated } : g)) });
    get().refreshUndoState();
  },
  deleteGroup: async (id) => {
    await api.groups.delete(id);
    set({
      groups: get().groups.filter((g) => g.id !== id),
      selectedGroupId: get().selectedGroupId === id ? null : get().selectedGroupId,
    });
    get().refreshUndoState();
  },
  setGroupNodes: async (groupId, nodeIds) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return;
    const currentIds = new Set(group.nodeIds);
    const newIds = new Set(nodeIds);
    const toAdd = nodeIds.filter((id) => !currentIds.has(id));
    const toRemove = group.nodeIds.filter((id) => !newIds.has(id));
    if (toAdd.length > 0) await api.groups.addNodes(groupId, toAdd);
    for (const id of toRemove) await api.groups.removeNode(groupId, id);
    if (toAdd.length > 0 || toRemove.length > 0) {
      set({ groups: get().groups.map((g) => (g.id === groupId ? { ...g, nodeIds } : g)) });
      get().refreshUndoState();
    }
  },
  selectGroup: (id) => set({ selectedGroupId: id, selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: new Set<string>() }),

  // Source Materials
  sourceMaterials: [],
  loadSourceMaterials: async () => {
    const p = get().project;
    if (!p) return;
    const materials = await api.sources.listMaterials(p.id);
    set({ sourceMaterials: materials });
  },

  // Revisions
  revisions: [],
  loadRevisions: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    const revisions = await api.revisions.list(chart.id);
    set({ revisions });
  },

  // Validation
  validationIssues: [],
  runValidation: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    try {
      const result = await api.exports.markdown(chart.id);
      // Use the chat endpoint for real validation
      set({ validationIssues: [] });
    } catch {
      set({ validationIssues: [] });
    }
  },

  // Selection
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: new Set<string>(),
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null, selectedNodeIds: new Set<string>() }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null, selectedNodeIds: new Set<string>() }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  deleteSelectedNodes: async () => {
    const ids = get().selectedNodeIds;
    if (ids.size === 0) return;
    // Single batch-delete request — server handles edges + nodes sequentially
    await api.nodes.batchDelete([...ids]);
    set({
      nodes: get().nodes.filter((n) => !ids.has(n.id)),
      edges: get().edges.filter((e) => !ids.has(e.fromNodeId) && !ids.has(e.toNodeId)),
      selectedNodeIds: new Set<string>(),
      selectedNodeId: null,
    });
    get().refreshUndoState();
  },

  // Chat
  chatMode: "builder",
  messages: [],
  messagesLoaded: false,
  isStreaming: false,
  isSummarizing: false,
  addMessage: (msg) => set({ messages: [...get().messages, msg] }),
  clearMessages: async () => {
    const p = get().project;
    if (p) {
      api.messages.clear(p.id).catch(() => {});
    }
    set({ messages: [], messagesLoaded: true, contextStatus: null });
  },
  loadMessages: async () => {
    if (get().isStreaming) {
      set({ messagesLoaded: true });
      return;
    }
    const p = get().project;
    if (!p) {
      set({ messagesLoaded: true });
      return;
    }
    try {
      const messages = await api.messages.list(p.id);
      set({
        messages,
        messagesLoaded: true,
        chatMode: "builder",
      });
    } catch {
      set({ messagesLoaded: true });
    }
  },
  setChatMode: (mode) => set({ chatMode: mode }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  sendChatMessage: async (content: string, attachments?: ChatAttachment[]) => {
    if (get().isStreaming) return;

    // Auto-summarize if context usage is above 80%
    const ctx = get().contextStatus;
    if (ctx && ctx.used / ctx.total >= 0.8 && get().messages.length >= 3) {
      await get().summarizeChat();
    }

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: "user",
      content,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...get().messages, userMsg], isStreaming: true });

    const pid = get().project?.id;
    if (pid) {
      api.messages
        .save(pid, {
          id: userMsg.id,
          role: userMsg.role,
          content: userMsg.content,
          createdAt: userMsg.timestamp,
        })
        .catch(() => {});
    }

    const allMessages = [...get().messages].map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
    }));

    abortController = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          mode: get().chatMode,
          projectId: get().project?.id ?? null,
          chartId: get().activeChart?.id ?? null,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`Chat error: ${res.statusText}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let assistantThinking = "";
      const toolCalls: ToolCall[] = [];
      const segments: MessageSegment[] = [];
      let currentSegmentType: "thinking" | "text" | null = null;
      let assistantMsgId = nanoid();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "assistant_msg_id") {
              assistantMsgId = parsed.id;
            }

            if (parsed.type === "thinking") {
              assistantThinking += parsed.content;
              // Append to current thinking segment or start a new one
              if (currentSegmentType === "thinking") {
                segments[segments.length - 1] = { type: "thinking", content: (segments[segments.length - 1] as { content: string }).content + parsed.content };
              } else {
                segments.push({ type: "thinking", content: parsed.content });
                currentSegmentType = "thinking";
              }
              set((state) => {
                const existing = state.messages.find((m) => m.id === assistantMsgId);
                const msgData = {
                  thinking: assistantThinking,
                  segments: [...segments],
                };
                if (existing) {
                  return {
                    messages: state.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, ...msgData } : m
                    ),
                  };
                }
                return {
                  messages: [
                    ...state.messages,
                    {
                      id: assistantMsgId,
                      role: "assistant" as const,
                      content: "",
                      ...msgData,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                };
              });
            }

            if (parsed.type === "content") {
              assistantContent += parsed.content;
              // Append to current text segment or start a new one
              if (currentSegmentType === "text") {
                segments[segments.length - 1] = { type: "text", content: (segments[segments.length - 1] as { content: string }).content + parsed.content };
              } else {
                segments.push({ type: "text", content: parsed.content });
                currentSegmentType = "text";
              }
              set((state) => {
                const existing = state.messages.find((m) => m.id === assistantMsgId);
                const msgData = {
                  content: assistantContent,
                  thinking: assistantThinking || undefined,
                  segments: [...segments],
                };
                if (existing) {
                  return {
                    messages: state.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, ...msgData } : m
                    ),
                  };
                }
                return {
                  messages: [
                    ...state.messages,
                    {
                      id: assistantMsgId,
                      role: "assistant" as const,
                      ...msgData,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                };
              });
            }

            if (parsed.type === "tool_call_result") {
              const tc = parsed.toolCall;
              const toolCall: ToolCall = {
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                result: tc.result,
                status: tc.success ? "executed" : "rejected",
              };
              toolCalls.push(toolCall);
              segments.push({ type: "tool_call", toolCall });
              currentSegmentType = null; // next content/thinking starts a new segment
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, toolCalls: [...toolCalls], segments: [...segments] } : m
                ),
              }));

              // Refresh canvas data immediately after each tool call
              if (tc.success) {
                const toolName = tc.name as string;
                if (toolName === "create_chart") {
                  await get().loadCharts();
                  if (tc.result?.id) await get().selectChart(tc.result.id);
                } else if (
                  toolName === "add_node" || toolName === "update_node" || toolName === "delete_node" ||
                  toolName === "resize_nodes" || toolName === "get_nodes"
                ) {
                  await get().loadNodes();
                } else if (
                  toolName === "add_edge" || toolName === "update_edge" || toolName === "delete_edge"
                ) {
                  await get().loadEdges();
                } else if (
                  toolName === "create_group" || toolName === "update_group" || toolName === "delete_group" ||
                  toolName === "group_nodes"
                ) {
                  await get().loadGroups();
                } else if (toolName === "build_chart") {
                  await Promise.all([get().loadNodes(), get().loadEdges()]);
                } else if (toolName === "update_chart" || toolName === "delete_chart") {
                  await get().loadCharts();
                }
              }
            }

            if (parsed.type === "context_status") {
              set({ contextStatus: { used: parsed.used, total: parsed.total } });
            }

            if (parsed.type === "summarizing") {
              set({ isSummarizing: true });
            }

            if (parsed.type === "context_summarized") {
              const summary = parsed.summary as string;
              const pid2 = get().project?.id;
              const summaryMsg: ChatMessage = {
                id: nanoid(),
                role: "system",
                content: summary,
                timestamp: new Date().toISOString(),
              };
              const currentMessages = get().messages;
              const latestUserMsg = currentMessages[currentMessages.length - 1];
              set({ messages: [summaryMsg, latestUserMsg], isSummarizing: false });
              if (pid2) {
                api.messages
                  .clear(pid2)
                  .then(() =>
                    Promise.all([
                      api.messages.save(pid2, {
                        id: summaryMsg.id,
                        role: summaryMsg.role,
                        content: summaryMsg.content,
                        createdAt: summaryMsg.timestamp,
                      }),
                      api.messages.save(pid2, {
                        id: latestUserMsg.id,
                        role: latestUserMsg.role,
                        content: latestUserMsg.content,
                        createdAt: latestUserMsg.timestamp,
                      }),
                    ])
                  )
                  .catch(() => {});
              }
            }

            if (parsed.type === "done") {
              set((state) => {
                const existing = state.messages.find((m) => m.id === assistantMsgId);
                if (!existing && (assistantContent || assistantThinking || toolCalls.length > 0)) {
                  return {
                    messages: [
                      ...state.messages,
                      {
                        id: assistantMsgId,
                        role: "assistant" as const,
                        content: assistantContent,
                        thinking: assistantThinking || undefined,
                        toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                        segments: segments.length > 0 ? [...segments] : undefined,
                        timestamp: new Date().toISOString(),
                      },
                    ],
                  };
                }
                return {};
              });

              // Persist assistant message
              const projId = get().project?.id;
              if (projId && (assistantContent || assistantThinking || toolCalls.length > 0)) {
                const assistantMsg = get().messages.find((m) => m.id === assistantMsgId);
                if (assistantMsg) {
                  api.messages
                    .save(projId, {
                      id: assistantMsg.id,
                      role: assistantMsg.role,
                      content: assistantMsg.content,
                      thinking: assistantMsg.thinking,
                      toolCalls: assistantMsg.toolCalls,
                      segments: assistantMsg.segments,
                      createdAt: assistantMsg.timestamp,
                    })
                    .catch(() => {});
                }
              }

              // Reload data if tools were called
              if (toolCalls.length > 0) {
                await get().loadAll();
              }
            }

            if (parsed.type === "error") {
              console.error("[chat] Server error:", parsed.error);
              set({
                messages: [
                  ...get().messages,
                  {
                    id: nanoid(),
                    role: "assistant",
                    content: `Error: ${parsed.error}`,
                    timestamp: new Date().toISOString(),
                  },
                ],
              });
            }
          } catch {
            // Skip unparseable
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User stopped
      } else {
        const err = e instanceof Error ? e : new Error(String(e));
        set({
          messages: [
            ...get().messages,
            {
              id: nanoid(),
              role: "assistant",
              content: `Error: ${err.message}`,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
    } finally {
      abortController = null;
      set({ isStreaming: false });
    }
  },

  stopStreaming: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    const msgs = get().messages;
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant") {
      set({ messages: msgs.slice(0, -1), isStreaming: false });
    } else {
      set({ isStreaming: false });
    }
  },

  summarizeChat: async () => {
    const pid = get().project?.id;
    if (!pid || get().isSummarizing || get().isStreaming) return;
    set({ isSummarizing: true });
    try {
      const { summary, messageId } = await api.messages.summarize(pid);
      const summaryMsg: ChatMessage = {
        id: messageId,
        role: "system",
        content: summary,
        timestamp: new Date().toISOString(),
      };
      set({ messages: [summaryMsg] });
    } finally {
      set({ isSummarizing: false });
    }
  },

  retryLastMessage: () => {
    if (get().isStreaming) return;
    const msgs = get().messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userContent = msgs[lastUserIdx].content;
    const trimmed = msgs.slice(0, lastUserIdx);
    set({ messages: trimmed });
    get().sendChatMessage(userContent);
  },

  restartFromMessage: async (messageId: string) => {
    if (get().isStreaming) return;
    const msgs = get().messages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1 || msgs[idx].role !== "user") return;
    const userContent = msgs[idx].content;
    const trimmed = msgs.slice(0, idx);
    set({ messages: trimmed });
    const pid = get().project?.id;
    if (pid) {
      await api.messages.deleteAfter(pid, messageId).catch(() => {});
    }
    get().sendChatMessage(userContent);
  },

  contextStatus: null,

  // Undo/Redo
  canUndo: false,
  canRedo: false,
  undoDesc: "",
  redoDesc: "",
  refreshUndoState: async () => {
    const chart = get().activeChart;
    if (!chart) return;
    try {
      const state = await api.undo.state(chart.id);
      set({ canUndo: state.canUndo, canRedo: state.canRedo, undoDesc: state.undoDesc, redoDesc: state.redoDesc });
    } catch {
      // ignore
    }
  },
  undo: async () => {
    const chart = get().activeChart;
    if (!chart || !get().canUndo) return;
    try {
      const result = await api.undo.undo(chart.id);
      set({ canUndo: result.canUndo, canRedo: result.canRedo, undoDesc: result.undoDesc, redoDesc: result.redoDesc });
      await Promise.all([get().loadNodes(), get().loadEdges(), get().loadGroups()]);
    } catch {
      // ignore
    }
  },
  redo: async () => {
    const chart = get().activeChart;
    if (!chart || !get().canRedo) return;
    try {
      const result = await api.undo.redo(chart.id);
      set({ canUndo: result.canUndo, canRedo: result.canRedo, undoDesc: result.undoDesc, redoDesc: result.redoDesc });
      await Promise.all([get().loadNodes(), get().loadEdges(), get().loadGroups()]);
    } catch {
      // ignore
    }
  },

  // Canvas export
  canvasExportFn: null,
  setCanvasExportFn: (fn) => set({ canvasExportFn: fn }),

  // Full reload
  loadAll: async () => {
    await get().loadCharts();
    if (get().activeChart) {
      await Promise.all([get().loadNodes(), get().loadEdges(), get().loadGroups()]);
    }
    await get().loadSourceMaterials();
    await get().loadMessages();
    get().refreshUndoState();
  },
}));
