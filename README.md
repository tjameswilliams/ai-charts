<p align="center">
  <img src="ai-charts-header.png" alt="AI Charts" width="100%" />
</p>

# AI Charts

AI-powered flowchart, ERD, and swimlane diagram builder.

AI Charts combines a built-in AI assistant for quick chart creation with an MCP server that lets external AI tools like Claude Desktop and Cursor create and manage charts programmatically. It works with any OpenAI-compatible LLM provider — Ollama, OpenAI, or your own endpoint. No vendor lock-in.

## Features

- **Three chart types** — flowcharts, entity-relationship diagrams, and swimlane diagrams
- **Built-in AI assistant** — setup wizard for new projects and a chart builder mode for iterating on diagrams through conversation
- **MCP server** — 18+ tools for external AI integration; connect Claude Desktop, Cursor, or any MCP client to create and manage charts programmatically
- **Any LLM provider** — works with Ollama, OpenAI, or any OpenAI-compatible API
- **Import/export** — portable ZIP project archives, Mermaid syntax, Markdown summaries, and PDF export
- **Auto-layout & validation** — ELK-based auto-layout, cycle detection, reachability analysis, and structural validation
- **Revision history** — full undo/redo with event tracking
- **Dark-themed UI** — built with React Flow for interactive diagram editing

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) and an LLM provider (e.g. [Ollama](https://ollama.com/))

```bash
git clone https://github.com/tjameswilliams/ai-charts.git
cd ai-charts
bun install
bun run db:push
bun run dev
```

The app will be available at [http://localhost:5174](http://localhost:5174).

## LLM Configuration

Configure your LLM provider through the Settings UI in the app. The default configuration points to a local Ollama instance:

| Setting | Default |
|---------|---------|
| API Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` |
| Model | `llama3.2` |

To use OpenAI, set the base URL to `https://api.openai.com/v1`, add your API key, and choose a model like `gpt-4o`. Any OpenAI-compatible endpoint works the same way.

## MCP Server

AI Charts exposes an MCP server so external AI tools can create and manage charts programmatically.

**Run standalone:**

```bash
bun run mcp
```

**Connect from Claude Desktop** — add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-charts": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/ai-charts"
    }
  }
}
```

**Available tools include:** `list_projects`, `create_project`, `list_charts`, `create_chart`, `build_chart`, `add_node`, `add_edge`, `delete_node`, `delete_edge`, `resize_nodes`, `get_nodes`, `get_chart_status`, `validate_chart`, `export_mermaid`, `export_markdown`, and more.

## Project Structure

```
client/              React + Vite frontend
  src/
    components/      UI components
    store/           Zustand state management
    api/             API client
server/              Bun + Hono backend
  routes/            API endpoints
  db/                Drizzle ORM schema & migrations
  lib/
    llm.ts           LLM integration & tool definitions
    mcp/             MCP server & client manager
    export/          Export utilities (Mermaid, Markdown, PDF)
    validation.ts    Chart validation
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh/)
- **Backend:** [Hono](https://hono.dev/), SQLite via [Drizzle ORM](https://orm.drizzle.team/)
- **Frontend:** React 19, [React Flow](https://reactflow.dev/), [Zustand](https://zustand-demo.pmnd.rs/), [Tailwind CSS 4](https://tailwindcss.com/)
- **AI:** OpenAI-compatible chat completions, [Model Context Protocol](https://modelcontextprotocol.io/)
- **Layout:** [ELK](https://www.eclipse.org/elk/) via elkjs

## License

[MIT](LICENSE)
