import JSZip from "jszip";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "./nanoid";
import { resolve, dirname, extname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";

const projectRoot = resolve(dirname(import.meta.dir), "..");
const uploadsDir = resolve(projectRoot, "uploads");

// ─── Helpers ──────────────────────────────────────────────

function remapIds<T extends Record<string, unknown>>(
  record: T,
  idMap: Map<string, string>,
  fieldNames: string[]
): T {
  const result = { ...record };
  for (const field of fieldNames) {
    const val = result[field];
    if (typeof val === "string" && idMap.has(val)) {
      (result as Record<string, unknown>)[field] = idMap.get(val)!;
    }
  }
  return result;
}

function remapStyleJsonUrls(styleJson: string | null, urlMap: Map<string, string>): string | null {
  if (!styleJson) return styleJson;
  try {
    const parsed = JSON.parse(styleJson);
    if (parsed.imageUrl && typeof parsed.imageUrl === "string") {
      for (const [oldUrl, newUrl] of urlMap) {
        if (parsed.imageUrl === oldUrl) {
          parsed.imageUrl = newUrl;
          break;
        }
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return styleJson;
  }
}

function remapSnapshotJson(
  snapshotJson: string,
  idMap: Map<string, string>,
  urlMap: Map<string, string>
): string {
  try {
    const snapshot = JSON.parse(snapshotJson);

    if (Array.isArray(snapshot.nodes)) {
      snapshot.nodes = snapshot.nodes.map((n: Record<string, unknown>) => {
        n = remapIds(n, idMap, ["id", "chartId", "sourceRefId"]);
        if (typeof n.styleJson === "string") {
          n.styleJson = remapStyleJsonUrls(n.styleJson as string, urlMap);
        }
        return n;
      });
    }

    if (Array.isArray(snapshot.edges)) {
      snapshot.edges = snapshot.edges.map((e: Record<string, unknown>) =>
        remapIds(e, idMap, ["id", "chartId", "fromNodeId", "toNodeId", "sourceRefId"])
      );
    }

    if (Array.isArray(snapshot.groups)) {
      snapshot.groups = snapshot.groups.map((g: Record<string, unknown>) => {
        g = remapIds(g, idMap, ["id", "chartId"]);
        if (Array.isArray(g.nodeIds)) {
          g.nodeIds = (g.nodeIds as string[]).map((id) => idMap.get(id) || id);
        }
        return g;
      });
    }

    return JSON.stringify(snapshot);
  } catch {
    return snapshotJson;
  }
}

function collectImageFilenames(nodes: Array<{ styleJson: string | null }>): string[] {
  const filenames: string[] = [];
  for (const node of nodes) {
    if (!node.styleJson) continue;
    try {
      const parsed = JSON.parse(node.styleJson);
      if (typeof parsed.imageUrl === "string") {
        const match = parsed.imageUrl.match(/\/api\/uploads\/(.+)$/);
        if (match) filenames.push(match[1]);
      }
    } catch {
      // skip
    }
  }
  return [...new Set(filenames)];
}

// ─── Export ───────────────────────────────────────────────

export async function exportProject(projectId: string): Promise<Buffer> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new Error("Project not found");

  const charts = await db.select().from(schema.charts).where(eq(schema.charts.projectId, projectId));
  const chartIds = charts.map((c) => c.id);

  const allNodes: (typeof schema.nodes.$inferSelect)[] = [];
  const allEdges: (typeof schema.edges.$inferSelect)[] = [];
  const allGroups: (typeof schema.groups.$inferSelect)[] = [];
  const allNodeGroups: (typeof schema.nodeGroups.$inferSelect)[] = [];
  const allAnnotations: (typeof schema.annotations.$inferSelect)[] = [];
  const allSourceRefs: (typeof schema.sourceReferences.$inferSelect)[] = [];
  const allRevisions: (typeof schema.revisions.$inferSelect)[] = [];

  for (const chartId of chartIds) {
    const nodes = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId));
    allNodes.push(...nodes);
    const edges = await db.select().from(schema.edges).where(eq(schema.edges.chartId, chartId));
    allEdges.push(...edges);
    const groups = await db.select().from(schema.groups).where(eq(schema.groups.chartId, chartId));
    allGroups.push(...groups);
    for (const g of groups) {
      const ngs = await db.select().from(schema.nodeGroups).where(eq(schema.nodeGroups.groupId, g.id));
      allNodeGroups.push(...ngs);
    }
    const annotations = await db.select().from(schema.annotations).where(eq(schema.annotations.chartId, chartId));
    allAnnotations.push(...annotations);
    const sourceRefs = await db.select().from(schema.sourceReferences).where(eq(schema.sourceReferences.chartId, chartId));
    allSourceRefs.push(...sourceRefs);
    const revisions = await db.select().from(schema.revisions).where(eq(schema.revisions.chartId, chartId));
    allRevisions.push(...revisions);
  }

  const sourceMaterials = await db.select().from(schema.sourceMaterials).where(eq(schema.sourceMaterials.projectId, projectId));
  const chatMessages = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));

  // Collect images
  const imageFilenames = collectImageFilenames(allNodes);

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), type: "project" }));
  zip.file("project.json", JSON.stringify(project));
  zip.file("charts.json", JSON.stringify(charts));
  zip.file("nodes.json", JSON.stringify(allNodes));
  zip.file("edges.json", JSON.stringify(allEdges));
  zip.file("groups.json", JSON.stringify(allGroups));
  zip.file("nodeGroups.json", JSON.stringify(allNodeGroups));
  zip.file("annotations.json", JSON.stringify(allAnnotations));
  zip.file("sourceReferences.json", JSON.stringify(allSourceRefs));
  zip.file("sourceMaterials.json", JSON.stringify(sourceMaterials));
  zip.file("revisions.json", JSON.stringify(allRevisions));
  zip.file("chatMessages.json", JSON.stringify(chatMessages));

  for (const filename of imageFilenames) {
    try {
      const data = await readFile(resolve(uploadsDir, filename));
      zip.file(`uploads/${filename}`, data);
    } catch {
      // Image file missing — skip
    }
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(buf);
}

export async function exportChart(chartId: string): Promise<Buffer> {
  const [chart] = await db.select().from(schema.charts).where(eq(schema.charts.id, chartId));
  if (!chart) throw new Error("Chart not found");

  const nodes = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId));
  const edges = await db.select().from(schema.edges).where(eq(schema.edges.chartId, chartId));
  const groups = await db.select().from(schema.groups).where(eq(schema.groups.chartId, chartId));
  const allNodeGroups: (typeof schema.nodeGroups.$inferSelect)[] = [];
  for (const g of groups) {
    const ngs = await db.select().from(schema.nodeGroups).where(eq(schema.nodeGroups.groupId, g.id));
    allNodeGroups.push(...ngs);
  }
  const annotations = await db.select().from(schema.annotations).where(eq(schema.annotations.chartId, chartId));
  const sourceRefs = await db.select().from(schema.sourceReferences).where(eq(schema.sourceReferences.chartId, chartId));
  const revisions = await db.select().from(schema.revisions).where(eq(schema.revisions.chartId, chartId));
  const sourceMaterials = await db.select().from(schema.sourceMaterials).where(eq(schema.sourceMaterials.projectId, chart.projectId));
  const chatMessages = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.chartId, chartId));

  const imageFilenames = collectImageFilenames(nodes);

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), type: "chart" }));
  zip.file("project.json", JSON.stringify(null));
  zip.file("charts.json", JSON.stringify([chart]));
  zip.file("nodes.json", JSON.stringify(nodes));
  zip.file("edges.json", JSON.stringify(edges));
  zip.file("groups.json", JSON.stringify(groups));
  zip.file("nodeGroups.json", JSON.stringify(allNodeGroups));
  zip.file("annotations.json", JSON.stringify(annotations));
  zip.file("sourceReferences.json", JSON.stringify(sourceRefs));
  zip.file("sourceMaterials.json", JSON.stringify(sourceMaterials));
  zip.file("revisions.json", JSON.stringify(revisions));
  zip.file("chatMessages.json", JSON.stringify(chatMessages));

  for (const filename of imageFilenames) {
    try {
      const data = await readFile(resolve(uploadsDir, filename));
      zip.file(`uploads/${filename}`, data);
    } catch {
      // skip
    }
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(buf);
}

// ─── Import ──────────────────────────────────────────────

async function readJsonFile<T>(zip: JSZip, name: string): Promise<T> {
  const file = zip.file(name);
  if (!file) throw new Error(`Missing ${name} in archive`);
  const text = await file.async("text");
  return JSON.parse(text);
}

export async function importProject(zipBuffer: Buffer): Promise<{ projectId: string }> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifest = await readJsonFile<{ version: number; type: string }>(zip, "manifest.json");
  if (manifest.version !== 1) throw new Error("Unsupported archive version");

  const projectData = await readJsonFile<Record<string, unknown> | null>(zip, "project.json");
  const chartsData = await readJsonFile<Record<string, unknown>[]>(zip, "charts.json");
  const nodesData = await readJsonFile<Record<string, unknown>[]>(zip, "nodes.json");
  const edgesData = await readJsonFile<Record<string, unknown>[]>(zip, "edges.json");
  const groupsData = await readJsonFile<Record<string, unknown>[]>(zip, "groups.json");
  const nodeGroupsData = await readJsonFile<Record<string, unknown>[]>(zip, "nodeGroups.json");
  const annotationsData = await readJsonFile<Record<string, unknown>[]>(zip, "annotations.json");
  const sourceRefsData = await readJsonFile<Record<string, unknown>[]>(zip, "sourceReferences.json");
  const sourceMatsData = await readJsonFile<Record<string, unknown>[]>(zip, "sourceMaterials.json");
  const revisionsData = await readJsonFile<Record<string, unknown>[]>(zip, "revisions.json");
  const chatMsgsData = await readJsonFile<Record<string, unknown>[]>(zip, "chatMessages.json");

  // Build ID remap map
  const idMap = new Map<string, string>();

  if (projectData && typeof projectData.id === "string") {
    idMap.set(projectData.id, newId());
  }
  for (const c of chartsData) idMap.set(c.id as string, newId());
  for (const n of nodesData) idMap.set(n.id as string, newId());
  for (const e of edgesData) idMap.set(e.id as string, newId());
  for (const g of groupsData) idMap.set(g.id as string, newId());
  for (const a of annotationsData) idMap.set(a.id as string, newId());
  for (const s of sourceRefsData) idMap.set(s.id as string, newId());
  for (const s of sourceMatsData) idMap.set(s.id as string, newId());
  for (const r of revisionsData) idMap.set(r.id as string, newId());
  for (const m of chatMsgsData) idMap.set(m.id as string, newId());

  // Handle images
  const urlMap = new Map<string, string>();
  await mkdir(uploadsDir, { recursive: true });

  const uploadFiles = zip.folder("uploads");
  if (uploadFiles) {
    const fileEntries: { name: string; file: JSZip.JSZipObject }[] = [];
    uploadFiles.forEach((relativePath, file) => {
      if (!file.dir) fileEntries.push({ name: relativePath, file });
    });
    for (const { name, file } of fileEntries) {
      const ext = extname(name);
      const newFilename = newId() + ext;
      const data = await file.async("nodebuffer");
      await writeFile(resolve(uploadsDir, newFilename), data);
      urlMap.set(`/api/uploads/${name}`, `/api/uploads/${newFilename}`);
    }
  }

  // Remap all records
  const now = new Date().toISOString();

  let newProjectId: string;
  if (projectData) {
    const remapped = remapIds(projectData, idMap, ["id"]);
    remapped.name = `${remapped.name} (imported)`;
    remapped.createdAt = now;
    remapped.updatedAt = now;
    newProjectId = remapped.id as string;

    await db.insert(schema.projects).values(remapped as typeof schema.projects.$inferInsert);
  } else {
    // Chart-only export imported as project — create one
    newProjectId = newId();
    await db.insert(schema.projects).values({
      id: newProjectId,
      name: "Imported Chart",
      description: "",
      createdAt: now,
      updatedAt: now,
    });
    // Set up idMap so chart projectId remaps
    for (const c of chartsData) {
      if (typeof c.projectId === "string") {
        idMap.set(c.projectId, newProjectId);
      }
    }
  }

  // Charts
  for (const c of chartsData) {
    const remapped = remapIds(c, idMap, ["id", "projectId"]);
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.charts).values(remapped as typeof schema.charts.$inferInsert);
  }

  // Source references
  for (const s of sourceRefsData) {
    const remapped = remapIds(s, idMap, ["id", "chartId"]);
    await db.insert(schema.sourceReferences).values(remapped as typeof schema.sourceReferences.$inferInsert);
  }

  // Nodes
  for (const n of nodesData) {
    const remapped = remapIds(n, idMap, ["id", "chartId", "sourceRefId"]);
    if (typeof remapped.styleJson === "string") {
      remapped.styleJson = remapStyleJsonUrls(remapped.styleJson as string, urlMap);
    }
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.nodes).values(remapped as typeof schema.nodes.$inferInsert);
  }

  // Edges
  for (const e of edgesData) {
    const remapped = remapIds(e, idMap, ["id", "chartId", "fromNodeId", "toNodeId", "sourceRefId"]);
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.edges).values(remapped as typeof schema.edges.$inferInsert);
  }

  // Groups
  for (const g of groupsData) {
    const remapped = remapIds(g, idMap, ["id", "chartId"]);
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.groups).values(remapped as typeof schema.groups.$inferInsert);
  }

  // NodeGroups
  for (const ng of nodeGroupsData) {
    const remapped = remapIds(ng, idMap, ["nodeId", "groupId"]);
    await db.insert(schema.nodeGroups).values(remapped as typeof schema.nodeGroups.$inferInsert);
  }

  // Annotations
  for (const a of annotationsData) {
    const remapped = remapIds(a, idMap, ["id", "chartId", "nodeId", "edgeId"]);
    await db.insert(schema.annotations).values(remapped as typeof schema.annotations.$inferInsert);
  }

  // Source materials
  for (const s of sourceMatsData) {
    const remapped = remapIds(s, idMap, ["id", "projectId"]);
    await db.insert(schema.sourceMaterials).values(remapped as typeof schema.sourceMaterials.$inferInsert);
  }

  // Revisions
  for (const r of revisionsData) {
    const remapped = remapIds(r, idMap, ["id", "chartId"]);
    if (typeof remapped.snapshotJson === "string") {
      remapped.snapshotJson = remapSnapshotJson(remapped.snapshotJson as string, idMap, urlMap);
    }
    await db.insert(schema.revisions).values(remapped as typeof schema.revisions.$inferInsert);
  }

  // Chat messages
  for (const m of chatMsgsData) {
    const remapped = remapIds(m, idMap, ["id", "projectId", "chartId"]);
    await db.insert(schema.chatMessages).values(remapped as typeof schema.chatMessages.$inferInsert);
  }

  return { projectId: newProjectId };
}

export async function importChart(
  zipBuffer: Buffer,
  targetProjectId: string
): Promise<{ chartId: string }> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifest = await readJsonFile<{ version: number; type: string }>(zip, "manifest.json");
  if (manifest.version !== 1) throw new Error("Unsupported archive version");

  const chartsData = await readJsonFile<Record<string, unknown>[]>(zip, "charts.json");
  const nodesData = await readJsonFile<Record<string, unknown>[]>(zip, "nodes.json");
  const edgesData = await readJsonFile<Record<string, unknown>[]>(zip, "edges.json");
  const groupsData = await readJsonFile<Record<string, unknown>[]>(zip, "groups.json");
  const nodeGroupsData = await readJsonFile<Record<string, unknown>[]>(zip, "nodeGroups.json");
  const annotationsData = await readJsonFile<Record<string, unknown>[]>(zip, "annotations.json");
  const sourceRefsData = await readJsonFile<Record<string, unknown>[]>(zip, "sourceReferences.json");
  const revisionsData = await readJsonFile<Record<string, unknown>[]>(zip, "revisions.json");
  const chatMsgsData = await readJsonFile<Record<string, unknown>[]>(zip, "chatMessages.json");

  if (chartsData.length === 0) throw new Error("No charts in archive");

  // Build ID remap map
  const idMap = new Map<string, string>();
  const firstChartNewId = newId();

  for (let i = 0; i < chartsData.length; i++) {
    idMap.set(chartsData[i].id as string, i === 0 ? firstChartNewId : newId());
  }
  for (const n of nodesData) idMap.set(n.id as string, newId());
  for (const e of edgesData) idMap.set(e.id as string, newId());
  for (const g of groupsData) idMap.set(g.id as string, newId());
  for (const a of annotationsData) idMap.set(a.id as string, newId());
  for (const s of sourceRefsData) idMap.set(s.id as string, newId());
  for (const r of revisionsData) idMap.set(r.id as string, newId());
  for (const m of chatMsgsData) idMap.set(m.id as string, newId());

  // Handle images
  const urlMap = new Map<string, string>();
  await mkdir(uploadsDir, { recursive: true });

  const uploadFiles = zip.folder("uploads");
  if (uploadFiles) {
    const fileEntries: { name: string; file: JSZip.JSZipObject }[] = [];
    uploadFiles.forEach((relativePath, file) => {
      if (!file.dir) fileEntries.push({ name: relativePath, file });
    });
    for (const { name, file } of fileEntries) {
      const ext = extname(name);
      const newFilename = newId() + ext;
      const data = await file.async("nodebuffer");
      await writeFile(resolve(uploadsDir, newFilename), data);
      urlMap.set(`/api/uploads/${name}`, `/api/uploads/${newFilename}`);
    }
  }

  const now = new Date().toISOString();

  // Charts — override projectId to target
  for (const c of chartsData) {
    const remapped = remapIds(c, idMap, ["id"]);
    remapped.projectId = targetProjectId;
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.charts).values(remapped as typeof schema.charts.$inferInsert);
  }

  // Source references
  for (const s of sourceRefsData) {
    const remapped = remapIds(s, idMap, ["id", "chartId"]);
    await db.insert(schema.sourceReferences).values(remapped as typeof schema.sourceReferences.$inferInsert);
  }

  // Nodes
  for (const n of nodesData) {
    const remapped = remapIds(n, idMap, ["id", "chartId", "sourceRefId"]);
    if (typeof remapped.styleJson === "string") {
      remapped.styleJson = remapStyleJsonUrls(remapped.styleJson as string, urlMap);
    }
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.nodes).values(remapped as typeof schema.nodes.$inferInsert);
  }

  // Edges
  for (const e of edgesData) {
    const remapped = remapIds(e, idMap, ["id", "chartId", "fromNodeId", "toNodeId", "sourceRefId"]);
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.edges).values(remapped as typeof schema.edges.$inferInsert);
  }

  // Groups
  for (const g of groupsData) {
    const remapped = remapIds(g, idMap, ["id", "chartId"]);
    remapped.createdAt = now;
    remapped.updatedAt = now;
    await db.insert(schema.groups).values(remapped as typeof schema.groups.$inferInsert);
  }

  // NodeGroups
  for (const ng of nodeGroupsData) {
    const remapped = remapIds(ng, idMap, ["nodeId", "groupId"]);
    await db.insert(schema.nodeGroups).values(remapped as typeof schema.nodeGroups.$inferInsert);
  }

  // Annotations
  for (const a of annotationsData) {
    const remapped = remapIds(a, idMap, ["id", "chartId", "nodeId", "edgeId"]);
    await db.insert(schema.annotations).values(remapped as typeof schema.annotations.$inferInsert);
  }

  // Revisions
  for (const r of revisionsData) {
    const remapped = remapIds(r, idMap, ["id", "chartId"]);
    if (typeof remapped.snapshotJson === "string") {
      remapped.snapshotJson = remapSnapshotJson(remapped.snapshotJson as string, idMap, urlMap);
    }
    await db.insert(schema.revisions).values(remapped as typeof schema.revisions.$inferInsert);
  }

  // Chat messages — assign to target project
  for (const m of chatMsgsData) {
    const remapped = remapIds(m, idMap, ["id", "chartId"]);
    remapped.projectId = targetProjectId;
    await db.insert(schema.chatMessages).values(remapped as typeof schema.chatMessages.$inferInsert);
  }

  return { chartId: firstChartNewId };
}
