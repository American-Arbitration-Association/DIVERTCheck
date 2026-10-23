# DIVERTCheck - Architecture

A short map of how DIVERTCheck fits together. See the [README](../README.md) for what the app does and how to run it, and [SETUP.md](SETUP.md) to get it running on a new machine.

## Components

![DIVERTCheck architecture](diagrams/architecture.png)

The same picture as a diagram-as-code source, for editing:

```mermaid
flowchart LR
    UI["React SPA<br/>Vite · TypeScript"]

    subgraph api["ASP.NET Core API — one process"]
        direction TB
        CTRL["Controllers"]
        SVC["Services"]
        REPO["Repositories · EF Core"]
        WORKER["AI job worker<br/>BackgroundService"]

        CTRL --> SVC
        SVC --> REPO
        WORKER --> SVC
    end

    DB[("PostgreSQL<br/>app data + job queue")]
    BLOB[("Blob Storage<br/>uploaded documents")]
    AOAI["Azure OpenAI"]

    UI -->|"HTTPS + JWT"| CTRL
    REPO --> DB
    SVC --> BLOB
    SVC --> AOAI
```

- The API and the AI worker are the **same process**. There is no separate service to deploy.
- The job queue is a **PostgreSQL table**, not a message broker.
- Key Vault (secrets) and Azure Monitor (telemetry) wire in at startup in [Program.cs](../api/Program.cs) and are not on any request path.
- A path-by-path view of the same system — intake, AI review, verification, prompt administration, accounts — is in the [flow diagram](diagrams/app_flow.png).


## Request path

A normal API call, front to back:

1. React calls the API over HTTPS with a JWT bearer token.
2. A controller validates the request and delegates — no logic lives here.
3. A service applies the business rules and calls Blob Storage if files are involved.
4. A repository reads or writes PostgreSQL through EF Core.

## Review path

Submitting an intake returns straight away; the AI work happens behind the queue.

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant A as API
    participant DB as PostgreSQL
    participant W as Worker
    participant B as Blob Storage
    participant AI as Azure OpenAI

    U->>A: POST case + documents
    A->>B: store files
    A->>DB: save case, enqueue AI job
    A-->>U: 201 Created
    loop poll every 5s
        W->>DB: claim runnable jobs
    end
    W->>B: fetch documents
    W->>AI: extract · chunk · evaluate
    AI-->>W: analysis
    W->>DB: write review + citations
    U->>A: GET /api/aijobs/{jobId}
    A-->>U: completed → show review
```

What each stage does:

- **Enqueue** — the case, its documents, and a row in `AiJobQueue`; the response does not wait for AI.
- **Claim** — [AiJobQueueHostedService](../api/Services/AiJobQueueHostedService.cs) polls every 5s and fans jobs out to a bounded number of workers, so one slow job does not block the rest.
- **Extract** — document text, plus vision extraction where a document needs it.
- **Evaluate** — chunked content scored against the active prompt configuration.
- **Persist** — a cited detailed review and a summary.

## Where things live

| Area | Path |
| --- | --- |
| Startup, DI, auth, CORS, telemetry | [api/Program.cs](../api/Program.cs) |
| HTTP endpoints | [api/Controllers/](../api/Controllers/) |
| Business logic and integrations | [api/Services/](../api/Services/) |
| Background worker | [api/Services/AiJobQueueHostedService.cs](../api/Services/AiJobQueueHostedService.cs) |
| Data access | [api/Data/](../api/Data/) |
| Entities and `DbContext` | [api/Models/](../api/Models/) |
| Request/response models | [api/ViewModel/](../api/ViewModel/) |
| Screens | [frontend/src/pages/](../frontend/src/pages/) |
| API clients | [frontend/src/services/](../frontend/src/services/) |

## Conventions worth knowing

- Controllers validate and delegate. Logic belongs in a service.
- Services are registered against interfaces in `api/Services/Interfaces` and resolved by DI in `Program.cs`. Most are scoped; `AiCancellationService` and `PasswordResetCodeService` are singletons because they hold in-memory state.
- The background worker resolves scoped services through `IServiceScopeFactory` — it cannot inject them directly.
- Secrets come from Key Vault in deployed environments and from `appsettings.*.json` locally. Never commit real values.
- Every endpoint requires authentication except `GET /health`.
