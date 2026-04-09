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

Meet **Milo AI** -- an AI coding assistant that runs as a VS Code extension, powered by LLMs. It can edit files, run terminal commands, use a browser, and extend itself via MCP tools -- all with human-in-the-loop approval for every action.

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

## Message Flow -- When a User Sends a Message

Detailed flow when a user types a message in the chat and sends it:

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

    User->>WV: Type message & press Send
    WV->>PB: ChatServiceClient.postUserMessage()
    PB->>PB: Generate requestId (UUID)
    PB->>GH: window.postMessage({type: "grpc_request", ...})

    GH->>GH: Lookup handler: serviceHandlers[service][method]
    GH->>CTRL: Route to matching handler
    CTRL->>TASK: Forward message to Task

    Note over TASK: Task.handleWebviewAskResponse()

    TASK->>TASK: parseMentions() - resolve @file, @url, @folder
    TASK->>TASK: parseSlashCommands() - resolve /compact, /newtask, ...
    TASK->>TASK: Load context: rules, skills, file details

    TASK->>SP: getSystemPrompt(promptContext)
    SP->>SP: Select variant by model family<br/>(generic / next-gen / xs / ...)
    SP-->>TASK: System prompt + tools

    loop Task Loop (recursivelyMakeClineRequests)
        TASK->>API: attemptApiRequest()<br/>api.messages.create({stream: true})
        API-->>TASK: Stream response chunks

        TASK->>TASK: Parse assistant response<br/>(text + tool_use blocks)

        alt Has tool calls
            TASK->>TE: executeTool(toolName, params)
            TE->>FS: Execute (read/write file,<br/>run command, browser action, ...)
            FS-->>TE: Result
            TE-->>TASK: Tool result
            TASK->>TASK: Append tool result to conversation
            Note over TASK: Continue loop -> call API again
        else No tool calls
            TASK->>TASK: Check completion
            Note over TASK: Ask model if task is done
        end

        TASK->>WV: say() -> send message to webview<br/>(text, tool feedback, cost, ...)
    end

    TASK->>WV: Task complete / waiting for user input
    WV->>User: Display result
```

---

## Skill / Slash Command Flow

Flow when a user invokes a skill (e.g., `/compact`, `/newtask`) or a custom skill from `SKILL.md`:

```mermaid
flowchart TD
    A["User types message containing<br/>/command or skill"] --> B{parseSlashCommands}

    B --> C{"Command type?"}

    C -->|"Built-in<br/>(/compact, /newtask,<br/>/newrule, /reportbug, ...)"| D["Map to corresponding handler<br/>(condenseToolResponse,<br/>newTaskToolResponse, ...)"]
    D --> E["Generate tool response instructions"]
    E --> J

    C -->|"MCP Prompt<br/>(/mcp:server:prompt)"| F["Call mcpPromptFetcher()<br/>fetch prompt from MCP server"]
    F --> G["Insert prompt content<br/>into message"]
    G --> J

    C -->|"Custom Skill<br/>(/skill-name)"| H{"Find SKILL.md in<br/>~/.milo/skills/ or<br/>.milo/skills/"}
    H -->|"Found"| I["Read SKILL.md<br/>(frontmatter + instructions)"]
    I --> J["Append instructions<br/>to user message"]
    H -->|"Not found"| K["Skip,<br/>keep message as-is"]
    K --> J

    J --> L["Message processed<br/>-> Continue to Task Loop"]

    style A fill:#e1f5fe
    style L fill:#e8f5e9
```

### Skill Discovery Details

```mermaid
flowchart LR
    subgraph "Skill Sources"
        G["~/.milo/skills/<br/>(Global Skills)"]
        P[".milo/skills/<br/>(Project Skills)"]
    end

    subgraph "Discovery Process"
        SCAN["Scan directories<br/>for SKILL.md files"]
        PARSE["Parse YAML frontmatter<br/>(name, description)"]
        TOGGLE["Check toggle state<br/>(globalSkillsToggles /<br/>localSkillsToggles)"]
        FILTER["Filter: only keep<br/>enabled skills"]
    end

    subgraph "Integration"
        SYS["Add to SystemPromptContext<br/>-> Model knows available skills"]
        SLASH_CMD["Register as<br/>slash command"]
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

The Webview and Extension communicate via a gRPC-like protocol over `postMessage`:

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

## Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: User sends message / New Task
    Created --> Initializing: Controller.initTask()
    Initializing --> Running: Task.startTask()

    state Running {
        [*] --> LoadContext
        LoadContext --> BuildPrompt: parseMentions, parseSlashCommands
        BuildPrompt --> APICall: attemptApiRequest()
        APICall --> StreamProcess: Stream response chunks
        StreamProcess --> ToolExec: Has tool_use blocks
        ToolExec --> APICall: Append result, loop back
        StreamProcess --> WaitUser: Needs user input (ask)
        WaitUser --> LoadContext: User responds
        StreamProcess --> Complete: No more tools, task done
    }

    Running --> Cancelled: User cancels
    Running --> Error: API error / abort
    Complete --> [*]
    Cancelled --> Resuming: User resumes
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
