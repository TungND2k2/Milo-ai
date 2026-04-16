# Milo AI API Server

Standalone API server exposing all Milo AI agent capabilities (tools, skills, agent loop) via REST API.

---

## Architecture

```mermaid
flowchart TB
    subgraph CLIENTS["🌐 Clients"]
        WEB["Web App"]
        MOBILE["Mobile App"]
        CLI["CLI / Script"]
        EXT["VS Code Extension"]
    end

    subgraph API_SERVER["🖥️ Milo AI API Server (Express)"]
        
        subgraph ROUTES["REST Endpoints"]
            RUN["POST /v1/agent/run<br/>(blocking, return full result)"]
            STREAM["POST /v1/agent/stream<br/>(SSE streaming events)"]
            SKILLS_EP["GET /v1/skills<br/>(list available skills)"]
            TOOLS_EP["GET /v1/tools<br/>(list available tools)"]
        end

        subgraph SESSION["Session Manager"]
            SM["Create / track / abort sessions"]
            RUNNER["Task Runner<br/>(wraps Cline Task engine)"]
        end

        subgraph CORE["Core Engine (from Cline)"]
            AGENT_LOOP["Agent Loop<br/>LLM → Tool → Repeat"]
            PROMPT["Prompt Builder<br/>(system prompt + rules)"]
            
            subgraph TOOLS["Built-in Tools"]
                T_FILE["read_file / write_file"]
                T_CMD["execute_command"]
                T_BROWSER["browser_action"]
                T_MCP["MCP tools"]
                T_SEARCH["search / grep"]
            end

            subgraph SKILL_SYS["Skill System"]
                SKILL_LOAD["Load SKILL.md files"]
                SLASH["Slash commands"]
            end
        end

        subgraph ADAPTERS["Adapters (replace VS Code)"]
            HOST["Headless HostProvider<br/>(no VS Code needed)"]
            SSE["SSE Event Bridge<br/>(say/ask → HTTP events)"]
            TERM["Standalone Terminal<br/>(child_process)"]
            FILE_EDIT["Headless File Editor<br/>(direct fs operations)"]
        end
    end

    subgraph LLM["🤖 LLM Backend"]
        OPENAI["OpenAI Compatible<br/>(Gemma4 / LiteLLM)"]
        ANTHROPIC["Anthropic<br/>(Claude)"]
        OTHER["Other providers<br/>(40+ supported)"]
    end

    CLIENTS -- "HTTP request" --> ROUTES
    ROUTES --> SESSION
    SESSION --> CORE
    CORE --> ADAPTERS
    AGENT_LOOP --> LLM
    LLM -- "streaming response" --> AGENT_LOOP
    AGENT_LOOP --> TOOLS
    TOOLS --> TERM
    TOOLS --> FILE_EDIT

    SSE -- "SSE events" --> CLIENTS
```

---

## What comes from Cline vs What's new

```mermaid
flowchart LR
    subgraph FROM_CLINE["✅ From Cline (reuse as-is)"]
        C1["Agent Loop<br/>(Task engine)"]
        C2["All 15+ Tools<br/>(file, terminal, browser...)"]
        C3["Skill System<br/>(SKILL.md)"]
        C4["Prompt Builder<br/>(model variants)"]
        C5["40+ LLM Providers"]
        C6["Slash Commands"]
        C7["MCP Support"]
        C8["Context Manager"]
    end

    subgraph NEW_CODE["🆕 New Code"]
        N1["HTTP Server<br/>(Express routes)"]
        N2["Session Manager<br/>(multi-user)"]
        N3["SSE Event Bridge<br/>(stream to HTTP)"]
        N4["Headless Adapters<br/>(replace VS Code APIs)"]
        N5["Config from env vars<br/>(not VS Code settings)"]
    end

    subgraph REMOVED["❌ Removed (VS Code only)"]
        R1["Webview UI"]
        R2["gRPC over postMessage"]
        R3["VS Code commands"]
        R4["Sidebar / panels"]
    end

    style FROM_CLINE fill:#e8f5e9
    style NEW_CODE fill:#e3f2fd
    style REMOVED fill:#ffebee
```

---

## API Usage

### Run a task (blocking)

```bash
curl -X POST http://localhost:3000/v1/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a hello world Express server in /tmp/demo",
    "apiKey": "sk-xxx",
    "modelId": "gemma4"
  }'
```

Response:
```json
{
  "sessionId": "abc-123",
  "status": "completed",
  "result": "Created Express server with index.js and package.json",
  "events": [...],
  "usage": { "inputTokens": 1200, "outputTokens": 800, "turns": 3 }
}
```

### Run a task (streaming)

```bash
curl -X POST http://localhost:3000/v1/agent/stream \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Fix the bug in src/utils.ts"
  }'
```

Response (SSE):
```
event: thinking
data: {"text": "Let me read the file first..."}

event: tool_call
data: {"tool": "read_file", "params": {"path": "src/utils.ts"}}

event: tool_result
data: {"tool": "read_file", "result": "file contents..."}

event: text
data: {"text": "I found the bug. The issue is..."}

event: tool_call
data: {"tool": "write_file", "params": {"path": "src/utils.ts", "content": "..."}}

event: completion
data: {"result": "Fixed the null check bug in parseConfig()"}
```

### List skills

```bash
curl http://localhost:3000/v1/skills
```

### List tools

```bash
curl http://localhost:3000/v1/tools
```

---

## Configuration

All config via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MILO_API_PORT` | `3000` | Server port |
| `MILO_API_HOST` | `0.0.0.0` | Server host |
| `MILO_WORKSPACE_DIR` | `cwd` | Default working directory |
| `MILO_DATA_DIR` | `~/.milo/data` | Data storage directory |
| `MILO_API_PROVIDER` | `openai` | Default LLM provider |
| `MILO_API_BASE_URL` | `https://api.inferx.x-or.cloud/v1` | Default API base URL |
| `MILO_API_KEY` | `` | Default API key |
| `MILO_MODEL_ID` | `gemma4` | Default model |
| `MILO_AUTO_APPROVE` | `true` | Auto-approve all tools |
| `MILO_MAX_TURNS` | `50` | Max agent loop turns |

---

## Project Structure

```
milo-ai-api/
  src/
    index.ts                    # Entry point, start server
    server.ts                   # Express app setup + routes
    config.ts                   # Load config from env vars

    routes/
      agent.ts                  # POST /v1/agent/run & /stream
      skills.ts                 # GET /v1/skills
      tools.ts                  # GET /v1/tools

    session/
      session-manager.ts        # Track active sessions
      task-runner.ts            # Wrap Cline Task engine

    adapters/
      host-provider-api.ts      # Headless HostProvider (no VS Code)
      host-bridge-noop.ts       # No-op VS Code service stubs
      sse-event-bridge.ts       # Bridge Task events → SSE stream

    types/
      api-types.ts              # Request/Response types

  # Imports from ../milo-ai/src/ (shared codebase):
  #   core/task/          → Agent loop
  #   core/api/           → LLM providers
  #   core/prompts/       → Prompt builder
  #   core/context/       → Skills, rules
  #   shared/             → Types, tools
```
