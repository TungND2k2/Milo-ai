# Milo AI

<p align="center">
  <img src="https://media.githubusercontent.com/media/milo-ai/milo-ai/main/assets/docs/demo.gif" width="100%" />
</p>

<div align="center">
<table>
<tbody>
<td align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=x-or-cloud.claude-dev" target="_blank"><strong>Download on VS Marketplace</strong></a>
</td>
<td align="center">
<a href="https://discord.gg/milo-ai" target="_blank"><strong>Discord</strong></a>
</td>
<td align="center">
<a href="https://docs.milo-ai.bot/getting-started/for-new-coders" target="_blank"><strong>Getting Started</strong></a>
</td>
</tbody>
</table>
</div>

Meet **Milo AI** -- an AI coding assistant that runs as a VS Code extension, powered by LLMs. It can edit files, run terminal commands, use a browser, and extend itself via MCP tools -- all with human-in-the-loop approval.

---

## Architecture Overview

```mermaid
graph TB
    subgraph "VS Code Extension Host"
        EXT["extension.ts<br/><i>activate()</i>"]
        COMMON["common.ts<br/><i>initialize()</i>"]
        SM["StateManager<br/><i>Global & Workspace State</i>"]
        CTRL["Controller<br/><i>src/core/controller/</i>"]
        GRPC_H["gRPC Handler<br/><i>grpc-handler.ts</i>"]
        TASK["Task Engine<br/><i>src/core/task/index.ts</i>"]
        TOOL_EXEC["ToolExecutor<br/><i>ToolExecutor.ts</i>"]
        PROMPT["PromptRegistry<br/><i>system-prompt/registry/</i>"]
        API_HANDLER["ApiHandler<br/><i>src/core/api/</i>"]
        MCP["McpHub<br/><i>MCP Servers</i>"]
        HOOKS["Hooks System<br/><i>src/core/hooks/</i>"]
        SKILLS["Skills Loader<br/><i>skills.ts</i>"]
        SLASH["Slash Commands<br/><i>slash-commands/</i>"]
        CTX["Context Manager<br/><i>src/core/context/</i>"]
    end

    subgraph "Webview (React iframe)"
        APP["App.tsx"]
        CHAT["ChatView.tsx"]
        SETTINGS["Settings Panel"]
        GRPC_C["gRPC Client<br/><i>ProtoBusClient</i>"]
        STATE_CTX["ExtensionStateContext"]
    end

    subgraph "External"
        LLM["LLM API<br/><i>Anthropic / OpenAI / etc.</i>"]
        FS["File System"]
        TERM["Terminal"]
        BROWSER["Headless Browser"]
        MCP_SRV["MCP Servers"]
    end

    EXT --> COMMON
    COMMON --> SM
    COMMON --> CTRL
    CTRL --> GRPC_H
    CTRL --> TASK
    CTRL --> MCP
    CTRL --> HOOKS
    TASK --> PROMPT
    TASK --> API_HANDLER
    TASK --> TOOL_EXEC
    TASK --> CTX
    TASK --> SLASH
    TASK --> SKILLS
    TOOL_EXEC --> FS
    TOOL_EXEC --> TERM
    TOOL_EXEC --> BROWSER
    TOOL_EXEC --> MCP_SRV

    GRPC_C -- "postMessage<br/>(gRPC over IPC)" --> GRPC_H
    GRPC_H -- "postMessage<br/>(response)" --> GRPC_C

    API_HANDLER -- "HTTP Stream" --> LLM

    CHAT --> GRPC_C
    SETTINGS --> GRPC_C
    GRPC_C --> STATE_CTX
    STATE_CTX --> APP
```

---

## Message Flow -- Khi user gui 1 message

Luong chi tiet khi user nhap message trong chat va gui di:

```mermaid
sequenceDiagram
    actor User
    participant WV as Webview<br/>(React)
    participant PB as ProtoBusClient<br/>(gRPC Client)
    participant GH as gRPC Handler<br/>(Extension)
    participant CTRL as Controller
    participant TASK as Task Engine
    participant SP as PromptRegistry<br/>(System Prompt)
    participant API as ApiHandler<br/>(LLM API)
    participant TE as ToolExecutor
    participant FS as File System /<br/>Terminal / Browser

    User->>WV: Nhap message & nhan Send
    WV->>PB: ChatServiceClient.postUserMessage()
    PB->>PB: Tao requestId (UUID)
    PB->>GH: window.postMessage({type: "grpc_request", ...})

    GH->>GH: Lookup handler: serviceHandlers[service][method]
    GH->>CTRL: Route den handler tuong ung
    CTRL->>TASK: Gui message vao Task

    Note over TASK: Task.handleWebviewAskResponse()

    TASK->>TASK: parseMentions() - xu ly @file, @url, @folder
    TASK->>TASK: parseSlashCommands() - xu ly /compact, /newtask, ...
    TASK->>TASK: Load context: rules, skills, file details

    TASK->>SP: getSystemPrompt(promptContext)
    SP->>SP: Chon variant theo model family<br/>(generic / next-gen / xs / ...)
    SP-->>TASK: System prompt + tools

    loop Task Loop (recursivelyMakeClineRequests)
        TASK->>API: attemptApiRequest()<br/>api.messages.create({stream: true})
        API-->>TASK: Stream response chunks

        TASK->>TASK: Parse assistant response<br/>(text + tool_use blocks)

        alt Co tool calls
            TASK->>TE: executeTool(toolName, params)
            TE->>FS: Thuc thi (read/write file,<br/>run command, browser action, ...)
            FS-->>TE: Ket qua
            TE-->>TASK: Tool result
            TASK->>TASK: Append tool result vao conversation
            Note over TASK: Tiep tuc loop -> goi API lai
        else Khong co tool calls
            TASK->>TASK: Kiem tra completion
            Note over TASK: Hoi model xem da xong chua
        end

        TASK->>WV: say() -> gui message ve webview<br/>(text, tool feedback, cost, ...)
    end

    TASK->>WV: Task hoan thanh / cho user input tiep
    WV->>User: Hien thi ket qua
```

---

## Skill / Slash Command Flow

Luong chay khi user dung skill (vd: `/compact`, `/newtask`) hoac custom skill tu `SKILL.md`:

```mermaid
flowchart TD
    A["User nhap message co chua<br/>/command hoac skill"] --> B{parseSlashCommands}

    B --> C{"Loai command?"}

    C -->|"Built-in<br/>(/compact, /newtask,<br/>/newrule, /reportbug, ...)"| D["Map sang handler tuong ung<br/>(condenseToolResponse,<br/>newTaskToolResponse, ...)"]
    D --> E["Tao tool response instructions"]
    E --> J

    C -->|"MCP Prompt<br/>(/mcp:server:prompt)"| F["Goi mcpPromptFetcher()<br/>lay prompt tu MCP server"]
    F --> G["Insert prompt content<br/>vao message"]
    G --> J

    C -->|"Custom Skill<br/>(/skill-name)"| H{"Tim SKILL.md trong<br/>~/.milo/skills/ hoac<br/>.milo/skills/"}
    H -->|"Tim thay"| I["Doc SKILL.md<br/>(frontmatter + instructions)"]
    I --> J["Append instructions<br/>vao user message"]
    H -->|"Khong tim thay"| K["Bo qua,<br/>giu nguyen message"]
    K --> J

    J --> L["Message da duoc xu ly<br/>-> Tiep tuc vao Task Loop"]

    style A fill:#e1f5fe
    style L fill:#e8f5e9
```

### Chi tiet Skill Discovery

```mermaid
flowchart LR
    subgraph "Skill Sources"
        G["~/.milo/skills/<br/>(Global Skills)"]
        P[".milo/skills/<br/>(Project Skills)"]
    end

    subgraph "Discovery Process"
        SCAN["Scan directories<br/>tim SKILL.md files"]
        PARSE["Parse YAML frontmatter<br/>(name, description)"]
        TOGGLE["Check toggle state<br/>(globalSkillsToggles /<br/>localSkillsToggles)"]
        FILTER["Filter: chi lay<br/>skills duoc enabled"]
    end

    subgraph "Integration"
        SYS["Them vao SystemPromptContext<br/>-> Model biet cac skills"]
        SLASH_CMD["Dang ky lam<br/>slash command"]
    end

    G --> SCAN
    P --> SCAN
    SCAN --> PARSE
    PARSE --> TOGGLE
    TOGGLE --> FILTER
    FILTER --> SYS
    FILTER --> SLASH_CMD
```

---

## gRPC Communication Layer

Webview va Extension giao tiep qua protocol giong gRPC, chay tren `postMessage`:

```mermaid
sequenceDiagram
    participant WV as Webview (React)
    participant EXT as Extension Host

    Note over WV,EXT: Unary Request (Request-Response)
    WV->>EXT: {type: "grpc_request",<br/>service, method, message, request_id}
    EXT-->>WV: {type: "grpc_response",<br/>message, request_id}

    Note over WV,EXT: Streaming Request
    WV->>EXT: {type: "grpc_request",<br/>..., is_streaming: true}
    EXT-->>WV: {grpc_response: {message, request_id,<br/>is_streaming: true, sequence_number: 1}}
    EXT-->>WV: {grpc_response: {message, request_id,<br/>is_streaming: true, sequence_number: 2}}
    EXT-->>WV: {grpc_response: {message, request_id,<br/>is_streaming: false}}

    Note over WV,EXT: Cancellation
    WV->>EXT: {type: "grpc_request_cancel",<br/>request_id}
    EXT-->>WV: {grpc_response: {cancelled: true,<br/>request_id}}
```

### Proto Services

| Service | File | Chuc nang |
|---------|------|-----------|
| `ChatService` | `proto/cline/task.proto` | Gui/nhan message, tao task |
| `StateService` | `proto/cline/state.proto` | Doc/ghi extension state, settings |
| `FileService` | `proto/cline/file.proto` | Thao tac file |
| `BrowserService` | `proto/cline/browser.proto` | Dieu khien browser |
| `AccountService` | `proto/cline/account.proto` | Auth, tai khoan |
| `McpService` | `proto/cline/mcp.proto` | Quan ly MCP servers |
| `CommandsService` | `proto/cline/commands.proto` | VS Code commands |

---

## Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: User gui message / New Task
    Created --> Initializing: Controller.initTask()
    Initializing --> Running: Task.startTask()

    state Running {
        [*] --> LoadContext
        LoadContext --> BuildPrompt: parseMentions, parseSlashCommands
        BuildPrompt --> APICall: attemptApiRequest()
        APICall --> StreamProcess: Stream response chunks
        StreamProcess --> ToolExec: Co tool_use blocks
        ToolExec --> APICall: Append result, loop lai
        StreamProcess --> WaitUser: Can user input (ask)
        WaitUser --> LoadContext: User tra loi
        StreamProcess --> Complete: Khong con tool, task xong
    }

    Running --> Cancelled: User cancel
    Running --> Error: API error / abort
    Complete --> [*]
    Cancelled --> Resuming: User resume
    Resuming --> Running: resumeTaskFromHistory()
    Error --> [*]
```

---

## Key Directories

```
src/
  extension.ts              # VS Code entry point
  common.ts                 # Platform-agnostic init
  core/
    controller/             # Central orchestrator
      index.ts              # Controller class
      grpc-handler.ts       # gRPC routing
      state/                # State update handlers
    task/
      index.ts              # Task engine (main loop)
      TaskState.ts          # Task state management
      ToolExecutor.ts       # Tool execution
      tools/handlers/       # Individual tool handlers
      message-state.ts      # Message state sync
    prompts/
      system-prompt/
        registry/           # PromptRegistry, PromptBuilder
        variants/           # Model-specific configs
        components/         # Reusable prompt sections
        tools/              # Tool definitions
      commands.ts           # Slash command prompts
    api/                    # API provider handlers
    context/                # Context management
    hooks/                  # Hook system
    slash-commands/          # Slash command parsing
  shared/
    proto/                  # Generated proto types
    api.ts                  # Provider & model definitions
    net.ts                  # Proxy-aware fetch
  generated/                # Auto-generated gRPC code
proto/                      # Proto definitions
webview-ui/
  src/
    App.tsx                 # React entry
    components/chat/        # Chat UI
    services/grpc-client.ts # Generated service clients
    context/                # State context
cli/                        # CLI (React Ink) interface
```

---

## Features

### Use any API and Model

Milo AI supports API providers like OpenRouter, Anthropic, OpenAI, Google Gemini, AWS Bedrock, Azure, GCP Vertex, Cerebras and Groq. You can also configure any OpenAI compatible API, or use a local model through LM Studio/Ollama.

### Run Commands in Terminal

Milo AI can execute commands directly in your terminal and receive the output -- installing packages, running build scripts, deploying applications, managing databases, and executing tests.

### Create and Edit Files

Milo AI can create and edit files directly in your editor, presenting you a diff view of the changes. It also monitors linter/compiler errors so it can fix issues on its own.

### Use the Browser

Milo AI can launch a browser, click elements, type text, and scroll, capturing screenshots and console logs at each step for interactive debugging and end-to-end testing.

### MCP Tools

Milo AI can extend its capabilities through custom MCP tools. Ask Milo AI to "add a tool" and it will create and install MCP servers tailored to your workflow.

### Checkpoints

The extension takes a snapshot of your workspace at each step. Use 'Compare' to see diffs and 'Restore' to roll back.

---

## Contributing

Start with our [Contributing Guide](CONTRIBUTING.md). Join [Discord](https://discord.gg/milo-ai) (`#contributors` channel).

## Enterprise

Get the same Milo AI experience with enterprise-grade controls: SSO (SAML/OIDC), global policies and configuration, observability with audit trails, private networking (VPC/private link), and self-hosted or on-prem deployments. Learn more at our [enterprise page](https://milo-ai.bot/enterprise) or [talk to us](https://milo-ai.bot/contact-sales).

## License

[Apache 2.0 © 2026 Milo AI Bot Inc.](./LICENSE)
