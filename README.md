# Milo AI

<p align="center">
  <img src="assets/icons/icon.png" width="128" />
</p>

**Milo AI** -- an AI coding assistant that runs as a VS Code extension, powered by LLMs. It can edit files, run terminal commands, use a browser, and extend itself via MCP tools -- all with human-in-the-loop approval for every action.

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
        MSG_STATE["MessageStateHandler<br/><i>message-state.ts</i>"]
        CHECKPOINT["CheckpointManager<br/><i>Git-based snapshots</i>"]
    end

    subgraph "Webview (React iframe)"
        APP["App.tsx"]
        CHAT["ChatView.tsx"]
        SETTINGS["Settings Panel"]
        GRPC_C["gRPC Client<br/><i>ProtoBusClient</i>"]
        STATE_CTX["ExtensionStateContext"]
    end

    subgraph "External"
        LLM["LLM API<br/><i>OpenAI Compatible / Anthropic / etc.</i>"]
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
    TASK --> MSG_STATE
    TASK --> CHECKPOINT
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

## Complete Message Flow -- When a User Sends a Message

### Phase 1: Webview to Extension

```mermaid
sequenceDiagram
    actor User
    participant Chat as ChatView<br/>(useMessageHandlers)
    participant PB as ProtoBusClient
    participant GH as gRPC Handler
    participant CTRL as Controller

    User->>Chat: Type message & press Send

    alt New Task (no existing messages)
        Chat->>PB: TaskServiceClient.newTask(text, images, files)
    else Responding to ask (tool approval, follow-up)
        Chat->>PB: TaskServiceClient.askResponse(response, text)
    else Task is streaming (interrupt)
        Chat->>PB: TaskServiceClient.askResponse("messageResponse", text)
    end

    PB->>PB: Generate requestId (UUID)
    PB->>PB: Encode message via protobuf
    PB->>GH: window.postMessage({<br/>  type: "grpc_request",<br/>  service: "cline.TaskService",<br/>  method: "newTask",<br/>  message: encoded,<br/>  request_id: uuid<br/>})

    GH->>GH: serviceHandlers["cline.TaskService"]["newTask"]
    GH->>CTRL: Route to handler function
```

### Phase 2: Task Creation & Initialization

```mermaid
flowchart TD
    A["Controller receives message"] --> B{"New task or existing?"}

    B -->|"New Task"| C["Controller.initTask()"]
    B -->|"Existing Task"| D["Task.handleWebviewAskResponse()"]

    C --> C1["clearTask() - cleanup previous"]
    C1 --> C2["setupWorkspaceManager()"]
    C2 --> C3["tryAcquireTaskLockWithRetry()<br/>(SQLite-based lock)"]
    C3 --> C4["new Task() constructor"]

    C4 --> C5["Initialize services:<br/>- MessageStateHandler<br/>- ContextManager<br/>- ApiHandler<br/>- TerminalManager<br/>- ToolExecutor<br/>- StreamHandler<br/>- CheckpointManager<br/>- PresentationScheduler"]

    C5 --> C6{"Has historyItem?"}
    C6 -->|"Yes"| C7["task.resumeTaskFromHistory()<br/>Load saved messages from disk"]
    C6 -->|"No"| C8["task.startTask()"]

    C8 --> E["say('task', userMessage)<br/>Show task in UI"]
    E --> F["Build userContent array:<br/>[text_block, image_blocks, file_content]"]
    F --> G{"Hooks enabled?"}

    G -->|"Yes"| H["Execute TaskStart hook<br/>(can inject context, cancel task)"]
    H --> I["Execute UserPromptSubmit hook<br/>(can inject external context)"]
    I --> J["initiateTaskLoop(userContent)"]

    G -->|"No"| J

    D --> J

    style C4 fill:#e3f2fd
    style J fill:#e8f5e9
```

### Phase 3: Main Task Loop (initiateTaskLoop)

```mermaid
flowchart TD
    START["initiateTaskLoop(userContent)"] --> LOOP_CHECK{"taskState.abort?"}

    LOOP_CHECK -->|"Yes"| ABORT["Task aborted → exit"]
    LOOP_CHECK -->|"No"| REC["recursivelyMakeClineRequests<br/>(userContent, includeFileDetails)"]

    REC --> REC_RESULT{"didEndLoop?"}
    REC_RESULT -->|"true"| DONE["Task complete → exit loop"]
    REC_RESULT -->|"false (no tools used)"| MISTAKE["consecutiveMistakeCount++"]

    MISTAKE --> MISTAKE_CHECK{"consecutiveMistakeCount<br/>> limit?"}
    MISTAKE_CHECK -->|"Yes"| ASK_USER["ask user for guidance<br/>or fail in yolo mode"]
    MISTAKE_CHECK -->|"No"| NO_TOOLS["nextUserContent =<br/>'noToolsUsed' prompt"]

    NO_TOOLS --> LOOP_CHECK
    ASK_USER --> LOOP_CHECK

    style START fill:#e3f2fd
    style DONE fill:#e8f5e9
    style ABORT fill:#ffebee
```

### Phase 4: recursivelyMakeClineRequests() - Detailed

```mermaid
flowchart TD
    START["recursivelyMakeClineRequests()"] --> VALIDATE["Phase 1: Validate<br/>Check abort flag, increment API counter"]

    VALIDATE --> CHECKPOINT{"First API request?"}
    CHECKPOINT -->|"Yes"| CP_CREATE["Phase 2: Create checkpoint<br/>say('checkpoint_created')<br/>Commit initial workspace snapshot"]
    CHECKPOINT -->|"No"| COMPACT_CHECK
    CP_CREATE --> COMPACT_CHECK

    COMPACT_CHECK --> COMPACT{"Phase 3: Context compaction needed?"}
    COMPACT -->|"Yes (auto-condense)"| COMPACT_DO["Use summarize_task<br/>Skip full context load"]
    COMPACT -->|"No"| LOAD_CTX

    COMPACT_DO --> API_REQ

    LOAD_CTX["Phase 4: Load Context"] --> MENTIONS["parseMentions()<br/>Resolve @file, @url, @folder"]
    MENTIONS --> SLASH_CMD["parseSlashCommands()<br/>Resolve /compact, /newtask, etc."]
    SLASH_CMD --> ENV["Load environment details:<br/>- Visible files<br/>- Workspace info<br/>- Focus chain<br/>- Custom rules (.milorules)"]

    ENV --> API_REQ["Phase 5: say('api_req_started')<br/>Show loading spinner"]

    API_REQ --> BUILD_PROMPT["Phase 6: Build System Prompt<br/>getSystemPrompt(promptContext)"]

    BUILD_PROMPT --> PROMPT_DETAIL["PromptRegistry selects variant:<br/>- generic (default)<br/>- next-gen (Claude 4, GPT-5)<br/>- xs (small/local models)<br/>- gpt-5, gemini-3, hermes, glm<br/><br/>PromptBuilder assembles:<br/>- System instructions<br/>- Tool specifications<br/>- Custom rules<br/>- Skills & capabilities<br/>- Browser/MCP instructions"]

    PROMPT_DETAIL --> CREATE_STREAM["Phase 7: Create API Stream<br/>api.createMessage(systemPrompt,<br/>  conversationHistory, tools)"]

    CREATE_STREAM --> STREAM_LOOP["Phase 8: Stream Processing Loop<br/>(see next diagram)"]

    STREAM_LOOP --> POST_STREAM["Phase 9: After stream<br/>- Finalize usage metrics<br/>- Update api_req_started with costs<br/>- Save to disk"]

    POST_STREAM --> TOOL_EXEC["Phase 10: Tool Execution Loop<br/>(see tool execution diagram)"]

    TOOL_EXEC --> RETURN{"Return didEndLoop"}

    style START fill:#e3f2fd
    style STREAM_LOOP fill:#fff3e0
    style TOOL_EXEC fill:#fce4ec
```

### Phase 5: Stream Processing Loop

```mermaid
flowchart TD
    START["Stream Processing Loop"] --> NEXT{"Get next chunk<br/>from API stream"}

    NEXT -->|"No more chunks"| FINALIZE["Finalize:<br/>- Complete reasoning block<br/>- Build assistantContent array<br/>- Add to apiConversationHistory"]

    NEXT -->|"chunk received"| CHUNK_TYPE{"chunk.type?"}

    CHUNK_TYPE -->|"reasoning"| THINKING["Process thinking/reasoning:<br/>- reasonsHandler.processReasoningDelta()<br/>- say('reasoning', thinking, partial=true)<br/>- Display thinking block in UI"]
    CHUNK_TYPE -->|"text"| TEXT["Process text content:<br/>- Accumulate assistantMessage<br/>- parseAssistantMessageV2() for XML tool blocks<br/>- Update taskState.assistantMessageContent<br/>- Schedule UI presentation"]
    CHUNK_TYPE -->|"tool_calls"| TOOL_CALL["Process native tool calls:<br/>- toolUseHandler.processToolUseDelta()<br/>- Store tool_use_id map<br/>- Schedule UI presentation (immediate)"]

    THINKING --> ABORT_CHECK
    TEXT --> ABORT_CHECK
    TOOL_CALL --> ABORT_CHECK

    ABORT_CHECK{"Check conditions"}
    ABORT_CHECK -->|"taskState.abort"| ABORT_STREAM["Abort stream → break"]
    ABORT_CHECK -->|"User rejected tool"| INTERRUPT["Interrupt stream<br/>with user message"]
    ABORT_CHECK -->|"OK"| PRESENT["PresentationScheduler:<br/>Batch UI updates<br/>say() partial messages<br/>postStateToWebview()"]

    PRESENT --> NEXT

    FINALIZE --> RETRY_CHECK{"Streaming error?"}
    RETRY_CHECK -->|"Yes"| RETRY["Auto-retry with backoff:<br/>Attempt 1: 2s delay<br/>Attempt 2: 4s delay<br/>Attempt 3: 8s delay<br/>say('error_retry')"]
    RETRY_CHECK -->|"No"| DONE["Stream complete"]

    RETRY --> NEXT

    style START fill:#fff3e0
    style THINKING fill:#f3e5f5
    style TEXT fill:#e8f5e9
    style TOOL_CALL fill:#fff8e1
    style ABORT_STREAM fill:#ffebee
```

### Phase 6: Tool Execution

```mermaid
flowchart TD
    START["Tool Execution Loop"] --> ITER{"Next block in<br/>assistantMessageContent?"}

    ITER -->|"No more blocks"| DONE["All tools executed<br/>→ Build userMessageContent<br/>→ Return to main loop"]

    ITER -->|"text block"| SAY_TEXT["say('text', content, partial=false)<br/>Display final text to user"]
    SAY_TEXT --> ITER

    ITER -->|"tool_use block"| TOOL_CHECK["Check tool eligibility:<br/>- Plan mode restrictions?<br/>- Max attempt limit?<br/>- Permission controller?"]

    TOOL_CHECK --> AUTO_APPROVE{"Auto-approve?"}
    AUTO_APPROVE -->|"Yes (yolo mode)"| EXECUTE
    AUTO_APPROVE -->|"No"| ASK_USER["ask('tool', toolInfo)<br/>Show tool call to user<br/>Wait for approval"]

    ASK_USER --> USER_RESPONSE{"User response?"}
    USER_RESPONSE -->|"Approve"| EXECUTE
    USER_RESPONSE -->|"Reject"| REJECT["Add rejection to userContent<br/>→ Continue loop"]

    EXECUTE["ToolExecutor.executeTool(block)"] --> DISPATCH["Dispatch to handler:<br/>- read_file → FileEditProvider<br/>- write_file → FileEditProvider<br/>- execute_command → CommandExecutor<br/>- browser_action → BrowserSession<br/>- use_mcp_tool → McpHub<br/>- attempt_completion → mark done<br/>- web_fetch → UrlContentFetcher"]

    DISPATCH --> RESULT["Get tool result"]
    RESULT --> SHOW_RESULT["say('tool_result', result)<br/>Display result in UI"]
    SHOW_RESULT --> ADD_RESULT["Append tool result<br/>to userMessageContent"]
    ADD_RESULT --> ITER

    REJECT --> ITER

    style START fill:#fce4ec
    style EXECUTE fill:#e8f5e9
    style DONE fill:#e3f2fd
```

---

## Session & Conversation Management

```mermaid
flowchart TD
    subgraph "Two Parallel Histories"
        API_HIST["apiConversationHistory<br/>(Anthropic MessageParam[])<br/><br/>Exact format sent to API<br/>role + content + timestamp<br/><br/>Saved to:<br/>~/.milo/tasks/{taskId}/<br/>apiConversationHistory.json"]
        UI_HIST["clineMessages<br/>(ClineMessage[])<br/><br/>UI display format<br/>type: ask/say + metadata<br/>partial flag for streaming<br/><br/>Saved to:<br/>~/.milo/tasks/{taskId}/<br/>messages.json"]
    end

    subgraph "Synchronization"
        MSG_HANDLER["MessageStateHandler<br/>(mutex-protected)"]
        DISK["Disk persistence<br/>(debounced saves)"]
        WEBVIEW["postStateToWebview()<br/>→ ExtensionStateContext"]
    end

    subgraph "Context Window Management"
        TOKEN_CHECK["Monitor token usage ratio"]
        COMPACT["Auto-condense when full:<br/>1. conversationHistoryDeletedRange<br/>2. summarize_task tool<br/>3. Preserve recent context"]
        RESUME["Task resumption:<br/>Load from disk<br/>Rebuild conversation"]
    end

    MSG_HANDLER --> API_HIST
    MSG_HANDLER --> UI_HIST
    MSG_HANDLER --> DISK
    MSG_HANDLER --> WEBVIEW

    TOKEN_CHECK --> COMPACT
    COMPACT --> API_HIST
    DISK --> RESUME
```

---

## Thinking / Reasoning Flow

```mermaid
sequenceDiagram
    participant API as LLM API
    participant SH as StreamHandler
    participant RH as ReasonsHandler
    participant UI as Webview (ChatView)
    participant HIST as apiConversationHistory

    API->>SH: chunk {type: "reasoning", text: "Let me think..."}
    SH->>RH: processReasoningDelta(chunk)
    RH->>RH: Accumulate thinking text
    RH->>RH: Preserve signature_delta (verification)
    SH->>UI: say("reasoning", thinkingText, partial=true)
    Note over UI: Display thinking block<br/>with collapsible UI

    API->>SH: chunk {type: "reasoning", text: "...analyzing code..."}
    SH->>RH: processReasoningDelta(chunk)
    SH->>UI: say("reasoning", thinkingText, partial=true)
    Note over UI: Update thinking block<br/>(streaming)

    API->>SH: chunk {type: "text", text: "Here's my answer..."}
    SH->>RH: finalize()
    RH-->>SH: Complete thinking block + signature

    SH->>HIST: Add to assistantContent:<br/>[thinking_block, text_block]
    Note over HIST: thinking_block includes<br/>signature for verification

    SH->>UI: say("text", response, partial=true)
    Note over UI: Display response text<br/>below thinking block
```

---

## Error Handling & Retry Flow

```mermaid
flowchart TD
    API_CALL["API Request"] --> FIRST_CHUNK{"First chunk?"}

    FIRST_CHUNK -->|"Error"| FIRST_ERR{"Error type?"}
    FIRST_ERR -->|"Context window exceeded"| CTX_ERR["handleContextWindowExceededError()<br/>- Truncate conversation history<br/>- Retry API request"]
    FIRST_ERR -->|"Other error"| ASK_RETRY["ask('api_req_failed')<br/>Show error to user<br/>Retry / Cancel options"]

    FIRST_CHUNK -->|"OK"| STREAMING["Stream processing..."]

    STREAMING -->|"Stream error"| RETRY_LOGIC{"Auto-retry<br/>attempts left?"}

    RETRY_LOGIC -->|"Yes"| BACKOFF["Exponential backoff:<br/>Attempt 1 → 2s<br/>Attempt 2 → 4s<br/>Attempt 3 → 8s"]
    BACKOFF --> SHOW_RETRY["say('error_retry')<br/>Show retry message"]
    SHOW_RETRY --> API_CALL

    RETRY_LOGIC -->|"No (exhausted)"| FAIL["Show error<br/>ask user to retry/cancel"]

    STREAMING -->|"User cancels"| CANCEL["abortTask()"]
    CANCEL --> CANCEL_HOOK{"Hooks enabled?"}
    CANCEL_HOOK -->|"Yes"| RUN_HOOK["Execute TaskCancel hook<br/>(cleanup, notifications)"]
    CANCEL_HOOK -->|"No"| RESUME_BTN
    RUN_HOOK --> RESUME_BTN["ask('resume_task')<br/>Show resume button"]

    style CTX_ERR fill:#fff3e0
    style BACKOFF fill:#e3f2fd
    style FAIL fill:#ffebee
    style CANCEL fill:#ffebee
```

---

## Checkpoint System

```mermaid
flowchart LR
    subgraph "Checkpoint Flow"
        FIRST["First API request"] --> CREATE["commitCheckpoint()<br/>Snapshot workspace state<br/>(shadow Git repo)"]
        CREATE --> TOOL["Tool executes<br/>(file edit, command, etc.)"]
        TOOL --> SAVE["saveCheckpoint()<br/>after each tool"]
        SAVE --> TOOL
    end

    subgraph "User Actions"
        COMPARE["Compare button<br/>→ Show diff from checkpoint"]
        RESTORE["Restore button<br/>→ Roll back to checkpoint"]
    end

    SAVE --> COMPARE
    SAVE --> RESTORE
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

### Key Services

| Service | Proto File | Purpose |
|---------|-----------|---------|
| `ChatService` | `proto/cline/task.proto` | Send/receive messages, create tasks |
| `StateService` | `proto/cline/state.proto` | Read/write extension state & settings |
| `FileService` | `proto/cline/file.proto` | File operations |
| `BrowserService` | `proto/cline/browser.proto` | Browser control |
| `AccountService` | `proto/cline/account.proto` | Authentication & accounts |
| `McpService` | `proto/cline/mcp.proto` | Manage MCP servers |
| `CommandsService` | `proto/cline/commands.proto` | VS Code commands |

---

## Skill / Slash Command Flow

```mermaid
flowchart TD
    A["User types message containing<br/>/command or skill"] --> B{parseSlashCommands}

    B --> C{"Command type?"}

    C -->|"Built-in<br/>(/compact, /newtask,<br/>/newrule, /reportbug, ...)"| D["Map to handler<br/>(condenseToolResponse,<br/>newTaskToolResponse, ...)"]
    D --> E["Generate tool response instructions"]
    E --> J

    C -->|"MCP Prompt<br/>(/mcp:server:prompt)"| F["mcpPromptFetcher()<br/>Fetch from MCP server"]
    F --> G["Insert prompt content"]
    G --> J

    C -->|"Custom Skill<br/>(/skill-name)"| H{"Find SKILL.md in<br/>~/.milo/skills/ or<br/>.milo/skills/"}
    H -->|"Found"| I["Read SKILL.md<br/>(frontmatter + instructions)"]
    I --> J["Append instructions<br/>to user message"]
    H -->|"Not found"| K["Skip"]
    K --> J

    J --> L["Continue to Task Loop"]

    style A fill:#e1f5fe
    style L fill:#e8f5e9
```

### Skill Discovery

```mermaid
flowchart LR
    subgraph "Skill Sources"
        G["~/.milo/skills/<br/>(Global)"]
        P[".milo/skills/<br/>(Project)"]
    end

    subgraph "Discovery"
        SCAN["Scan for SKILL.md"]
        PARSE["Parse YAML frontmatter"]
        TOGGLE["Check toggle state"]
        FILTER["Filter enabled only"]
    end

    subgraph "Integration"
        SYS["SystemPromptContext"]
        SLASH_CMD["Slash command"]
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

## Hooks System

```mermaid
flowchart TD
    subgraph "Task Lifecycle Hooks"
        TS["TaskStart<br/>Before first API request<br/>Can inject context or cancel"]
        UPS["UserPromptSubmit<br/>After TaskStart<br/>Inject external context"]
        TC["TaskCancel<br/>When user cancels<br/>Cleanup & notifications"]
    end

    subgraph "Tool Hooks"
        PRE["Pre-tool hook<br/>Validate / modify / reject"]
        POST["Post-tool hook<br/>React to tool results"]
    end

    START["Task starts"] --> TS
    TS --> UPS
    UPS --> LOOP["Main task loop"]
    LOOP --> PRE
    PRE --> EXEC["Tool execution"]
    EXEC --> POST
    POST --> LOOP
    LOOP -->|"User cancels"| TC
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
      index.ts              # Task engine (main loop ~3700 lines)
      TaskState.ts          # Task state management
      ToolExecutor.ts       # Tool dispatch & execution
      tools/handlers/       # Individual tool handlers
      message-state.ts      # Dual history sync (API + UI)
      TaskPresentationScheduler.ts  # Batched UI updates
    prompts/
      system-prompt/
        registry/           # PromptRegistry, PromptBuilder, ClineToolSet
        variants/           # Model-specific configs (generic, next-gen, xs, ...)
        components/         # Reusable prompt sections
        tools/              # Tool definitions per model family
      commands.ts           # Slash command prompts
    api/                    # API provider handlers
    context/                # Context management & tracking
    hooks/                  # Hook system (TaskStart, Cancel, etc.)
    slash-commands/          # Slash command parsing
  shared/
    proto/                  # Generated proto types
    api.ts                  # Provider & model definitions
    net.ts                  # Proxy-aware fetch
  generated/                # Auto-generated gRPC code
proto/                      # Proto definitions (.proto files)
webview-ui/
  src/
    App.tsx                 # React entry point
    components/chat/        # Chat UI (ChatView, ChatRow, InputSection)
    services/grpc-client.ts # Generated service clients
    context/                # ExtensionStateContext
cli/                        # CLI (React Ink) terminal UI
```

---

## License

[Apache 2.0 © 2026 Milo AI Bot Inc.](./LICENSE)
