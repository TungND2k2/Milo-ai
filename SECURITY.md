# Milo AI

<p align="center">
  <img src="assets/icons/icon.png" width="128" />
</p>

**Milo AI** -- an AI coding assistant that runs as a VS Code extension, powered by LLMs. It can edit files, run terminal commands, use a browser, and extend itself via MCP tools.

---

## Installation

### Prerequisites

- [VS Code](https://code.visualstudio.com/) version 1.84 or higher
- An LLM API endpoint (OpenAI Compatible, Anthropic, etc.)

### Install from VSIX

1. Download the latest `.vsix` file from the 
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) → type **"Install from VSIX"**
4. Select the downloaded `milo-ai-x.x.x.vsix` file
5. Reload VS Code when prompted

**Or install via terminal:**

### First-time Setup

After installation, Milo AI will open a welcome screen:

1. Enter your **API Base URL** (e.g. `https://api.inferx.x-or.cloud/v1`)
2. Enter your **API Key**
3. Click **Get Started**

> Default model is `gemma4`. You can change the provider, model, and other settings later in Settings (gear icon).


---

## Flow 1: Overall Architecture

How the Client (VS Code UI), Extension (brain), and LLM (AI model) work together:

```mermaid
flowchart LR
    subgraph CLIENT["🖥️ Client (VS Code Webview)"]
        UI["Chat UI"]
        SETTINGS["Settings"]
    end

    subgraph EXTENSION["⚙️ Extension (Backend)"]
        CTRL["Controller"]
        
        subgraph SESSION["Session Manager"]
            TASK["Task Engine"]
            HISTORY["Conversation History"]
            CHECKPOINT["Checkpoint<br/>(auto-save snapshots)"]
        end

        subgraph SKILLS["Skills & Tools"]
            SLASH["Slash Commands<br/>/compact /newtask ..."]
            CUSTOM_SKILL["Custom Skills<br/>SKILL.md files"]
            MCP_TOOL["MCP Tools<br/>(extensible)"]
            BUILTIN["Built-in Tools<br/>read file, write file,<br/>run command, browser ..."]
        end

        RULES["Rules & Context<br/>.milorules, @mentions"]
        PROMPT["Prompt Builder<br/>(system prompt + tools)"]
    end

    subgraph LLM["🤖 LLM (AI Model)"]
        API["API Provider<br/>OpenAI Compatible /<br/>Anthropic / etc."]
    end

    UI -- "user message" --> CTRL
    CTRL -- "response / tool results" --> UI
    SETTINGS -- "config (provider, model, API key)" --> CTRL

    CTRL --> TASK
    TASK --> HISTORY
    TASK --> CHECKPOINT
    TASK --> RULES
    TASK --> SKILLS
    RULES --> PROMPT
    SKILLS --> PROMPT

    PROMPT -- "system prompt + conversation + tools" --> API
    API -- "streaming response (text / tool calls / thinking)" --> TASK

    TASK -- "execute" --> BUILTIN
    BUILTIN -- "result" --> TASK
```

**How it works:**

1. **User sends a message** in the Chat UI
2. **Controller** creates or resumes a **Session** (Task)
3. Session loads **Rules** (from .milorules files) and available **Skills**
4. **Prompt Builder** assembles everything into a system prompt
5. Sends to **LLM** via API (streaming)
6. LLM responds with **text**, **tool calls**, or **thinking**
7. If LLM requests a tool → Extension **executes it** → sends result back to LLM
8. Loop continues until LLM says "done"
9. Final response shown to user

---

## Flow 2: Message Processing & Execution

What happens step-by-step when you send a message:

```mermaid
flowchart TD
    START(["💬 User sends message"]) --> PARSE

    subgraph PARSE_PHASE["1️⃣ Parse & Prepare"]
        PARSE["Parse message"]
        PARSE --> MENTIONS{"Has @mentions?"}
        MENTIONS -->|"@file, @url"| LOAD_FILES["Load file contents / fetch URLs"]
        MENTIONS -->|"No"| SLASH_CHECK

        LOAD_FILES --> SLASH_CHECK{"Has /commands?"}
        SLASH_CHECK -->|"/compact, /newtask ..."| RUN_SLASH["Execute slash command"]
        SLASH_CHECK -->|"/skill-name"| LOAD_SKILL["Load SKILL.md instructions"]
        SLASH_CHECK -->|"No"| BUILD
        RUN_SLASH --> BUILD
        LOAD_SKILL --> BUILD

        BUILD["Build system prompt<br/>+ attach rules & tools"]
    end

    BUILD --> SEND

    subgraph LLM_PHASE["2️⃣ LLM Thinking & Response"]
        SEND["Send to LLM API<br/>(streaming)"]
        SEND --> STREAM["Receive stream chunks"]

        STREAM --> CHUNK_TYPE{"What did LLM return?"}

        CHUNK_TYPE -->|"💭 Thinking"| SHOW_THINK["Show thinking block<br/>(collapsible in UI)"]
        CHUNK_TYPE -->|"💬 Text"| SHOW_TEXT["Show text response<br/>(streaming, real-time)"]
        CHUNK_TYPE -->|"🔧 Tool Call"| TOOL_CALL["Tool call detected"]

        SHOW_THINK --> STREAM
        SHOW_TEXT --> STREAM
    end

    TOOL_CALL --> APPROVE

    subgraph TOOL_PHASE["3️⃣ Tool Execution"]
        APPROVE{"Auto-approve<br/>enabled?"}
        APPROVE -->|"Yes"| EXECUTE
        APPROVE -->|"No"| ASK_USER["Ask user permission"]
        ASK_USER -->|"Approved ✓"| EXECUTE
        ASK_USER -->|"Rejected ✗"| SKIP["Skip tool,<br/>tell LLM it was rejected"]

        EXECUTE["Execute tool"]

        EXECUTE --> TOOL_TYPE{"Which tool?"}
        TOOL_TYPE -->|"📄 read_file"| T1["Read file content"]
        TOOL_TYPE -->|"✏️ write_file"| T2["Create/edit file<br/>(show diff)"]
        TOOL_TYPE -->|"▶️ execute_command"| T3["Run terminal command"]
        TOOL_TYPE -->|"🌐 browser_action"| T4["Browser automation<br/>(click, type, screenshot)"]
        TOOL_TYPE -->|"🔌 MCP tool"| T5["Call MCP server"]
        TOOL_TYPE -->|"✅ attempt_completion"| DONE

        T1 --> RESULT["Send result back to LLM"]
        T2 --> RESULT
        T3 --> RESULT
        T4 --> RESULT
        T5 --> RESULT
        SKIP --> RESULT
    end

    RESULT --> SEND

    DONE(["✅ Task complete!<br/>Show final result to user"])

    subgraph ERROR_PHASE["⚠️ Error Handling"]
        ERR_API["API error / timeout"]
        ERR_API --> RETRY["Auto-retry<br/>(2s → 4s → 8s backoff)"]
        RETRY -->|"Success"| STREAM
        RETRY -->|"All retries failed"| ASK_RETRY["Ask user: Retry or Cancel?"]
    end

    STREAM -.->|"Error"| ERR_API

    style START fill:#e3f2fd
    style DONE fill:#e8f5e9
    style SHOW_THINK fill:#f3e5f5
    style SHOW_TEXT fill:#e8f5e9
    style TOOL_CALL fill:#fff3e0
```

**The loop explained simply:**

1. **Parse** — resolve @mentions and /commands in the message
2. **Send to LLM** — stream the response in real-time
3. **LLM responds** with one of:
   - **Thinking** → shown as collapsible block (reasoning process)
   - **Text** → shown directly (streaming, word by word)
   - **Tool call** → extension executes the tool, sends result back to LLM
4. **Repeat** — LLM keeps calling tools until the task is done
5. **Done** — LLM calls `attempt_completion` to finish

---

## Key Directories

```
src/
  core/
    controller/        # Receives messages, manages sessions
    task/              # Task engine (main loop, tool execution)
    prompts/           # System prompt builder (per model variant)
    api/               # API provider handlers
    context/           # Rules, file tracking, mentions
    hooks/             # Lifecycle hooks (TaskStart, Cancel)
    slash-commands/     # Built-in slash command handlers
  shared/
    api.ts             # Provider & model definitions
    net.ts             # Proxy-aware networking
proto/                 # gRPC protocol definitions
webview-ui/            # React frontend (Chat UI, Settings)
cli/                   # Terminal UI (React Ink)
```

---

## License

[Apache 2.0 © 2026 Milo AI Bot Inc.](./LICENSE)
