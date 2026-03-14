import { useState, useEffect } from "react";

const TABS = ["Claude Code", "Cursor", "LM Studio", "OpenCode"] as const;
type Tool = (typeof TABS)[number];

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono overflow-x-auto">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function getConfigs(root: string): Record<Tool, { file: string; note?: string; json: string }> {
  const script = `${root}/server/lib/mcp/server.ts`;
  return {
    "Claude Code": {
      file: "~/.claude.json",
      json: `{
  "mcpServers": {
    "ai-charts": {
      "command": "bun",
      "args": ["run", "${script}"]
    }
  }
}`,
    },
    Cursor: {
      file: "~/.cursor/mcp.json",
      note: "Or create .cursor/mcp.json in your project root for project-scoped config.",
      json: `{
  "mcpServers": {
    "ai-charts": {
      "command": "bun",
      "args": ["run", "${script}"]
    }
  }
}`,
    },
    "LM Studio": {
      file: "~/.lmstudio/mcp.json",
      note: "Requires LM Studio 0.3.12+. Enable MCP in Settings > Developer.",
      json: `{
  "mcpServers": {
    "ai-charts": {
      "command": "bun",
      "args": ["run", "${script}"]
    }
  }
}`,
    },
    OpenCode: {
      file: "opencode.json (project root) or ~/.config/opencode/opencode.json",
      note: "OpenCode uses a different format \u2014 command and args are a single array, and there's no cwd field.",
      json: `{
  "mcp": {
    "ai-charts": {
      "type": "local",
      "command": ["bun", "run", "${script}"],
      "enabled": true
    }
  }
}`,
    },
  };
}

const TOOLS_LIST = [
  "list_projects",
  "create_project",
  "list_charts",
  "create_chart",
  "get_chart_status",
  "build_chart",
  "add_node",
  "add_edge",
  "delete_node",
  "delete_edge",
  "validate_chart",
  "export_mermaid",
  "export_markdown",
];

export function SetupPane() {
  const [activeTool, setActiveTool] = useState<Tool>("Claude Code");
  const [projectRoot, setProjectRoot] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((data) => setProjectRoot(data.projectRoot))
      .catch(() => setProjectRoot("/path/to/ai-charts"));
  }, []);

  if (!projectRoot) return null;

  const configs = getConfigs(projectRoot);
  const config = configs[activeTool];

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-200">MCP Setup</h2>
        <p className="text-[11px] text-zinc-500 mt-1">
          Connect AI Charts to your AI coding tool via the Model Context Protocol.
        </p>
      </div>

      <div className="px-4 py-3 space-y-4 flex-1">
        {/* Prerequisites */}
        <section>
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Prerequisites</h3>
          <ul className="text-[11px] text-zinc-400 space-y-1 list-disc pl-4">
            <li>
              <a href="https://bun.sh" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                Bun
              </a>{" "}
              runtime installed
            </li>
            <li>AI Charts server dependencies installed (<code className="text-zinc-300">bun install</code>)</li>
            <li>Database initialized (tables created via <code className="text-zinc-300">bun run db:push</code>)</li>
          </ul>
        </section>

        {/* Tool selector */}
        <section>
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Configuration</h3>
          <div className="flex gap-1 mb-3 flex-wrap">
            {TABS.map((tool) => (
              <button
                key={tool}
                onClick={() => setActiveTool(tool)}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                  activeTool === tool
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {tool}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-zinc-500 mb-2">
            Add to <code className="text-zinc-300">{config.file}</code>:
          </p>

          <CodeBlock>{config.json}</CodeBlock>

          {config.note && (
            <p className="text-[11px] text-zinc-500 mt-2">{config.note}</p>
          )}
        </section>

        {/* Verify */}
        <section>
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Verify</h3>
          <p className="text-[11px] text-zinc-400 mb-2">
            Test the MCP server runs correctly:
          </p>
          <CodeBlock>{`cd ${projectRoot} && bun run mcp`}</CodeBlock>
          <p className="text-[11px] text-zinc-500 mt-1">
            You should see: <code className="text-zinc-300">[mcp] AI Charts MCP server running on stdio</code>
          </p>
        </section>

        {/* Available tools */}
        <section>
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Available Tools ({TOOLS_LIST.length})</h3>
          <div className="grid grid-cols-2 gap-1">
            {TOOLS_LIST.map((tool) => (
              <div
                key={tool}
                className="text-[11px] text-zinc-400 bg-zinc-800/50 rounded px-2 py-1 font-mono"
              >
                {tool}
              </div>
            ))}
          </div>
        </section>

        {/* Usage example */}
        <section>
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Example Usage</h3>
          <p className="text-[11px] text-zinc-400 mb-2">
            Once connected, ask your AI assistant to:
          </p>
          <div className="space-y-2 text-[11px] text-zinc-400">
            <div className="bg-zinc-800/50 rounded p-2 italic">
              "Create a new project called 'User Onboarding' and build a flowchart showing the signup process"
            </div>
            <div className="bg-zinc-800/50 rounded p-2 italic">
              "Show me the current chart status and run validation"
            </div>
            <div className="bg-zinc-800/50 rounded p-2 italic">
              "Export the chart as Mermaid syntax"
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
