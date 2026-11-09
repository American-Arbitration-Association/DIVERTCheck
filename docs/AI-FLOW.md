# DIVERTCheck - AI Flow

What happens between "Run Review" and a finished, cited review — and how to watch it happen in Azure AI Foundry.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the API, worker, and Azure services fit together, and [SETUP.md](SETUP.md) for configuration.

- [The pipeline at a glance](#the-pipeline-at-a-glance)
- [Stage 1 — Vision extraction](#stage-1--vision-extraction)
- [Stage 2 — Transaction extraction and the financial total](#stage-2--transaction-extraction-and-the-financial-total)
- [Stage 3 — Chunking and evidence analysis](#stage-3--chunking-and-evidence-analysis)
- [Stage 4 — The cited review](#stage-4--the-cited-review)
- [Stage 5 — The summary](#stage-5--the-summary)
- [Prompts](#prompts)
- [Tuning knobs](#tuning-knobs)
- [Tracing in Azure AI Foundry](#tracing-in-azure-ai-foundry)

## The pipeline at a glance

Everything below runs inside `ExecuteCaseReviewAsync` in [api/Services/OpenAiExecutionService.cs](../api/Services/OpenAiExecutionService.cs), called by the background worker after a review is queued.

```mermaid
flowchart TB
    START["Queued AI job<br/>(documents from Blob Storage)"]

    subgraph s1["1 — Vision extraction"]
        V0{"Cache lookup:<br/>SHA-256 content hash<br/>+ active vision prompt config"}
        V1["PDF → page images (Docnet)"]
        V2["Vision model per page"]
        V3["Per-page text written to cache"]
        V4["Reuse cached extraction<br/>no vision call"]
        V0 -->|"miss"| V1 --> V2 --> V3
        V0 -->|"hit — same hash and prompt"| V4
    end

    subgraph s2["2 — Transaction extraction"]
        T1["Only documents flagged<br/>as transaction evidence"]
        T2["Structured JSON per statement unit:<br/>summaries + every row + other amounts"]
        T1 --> T2 
    end

    subgraph s3["3 — Evidence analysis"]
        C1["Chunk all extracted text"]
        C2["Send chunks in parallel"]
        C3["Evidence digest"]
        C1 --> C2 --> C3
    end

    subgraph s4["4 — Cited review"]
        R1["Upload extracted text as files"]
        R2["Vector store + file search"]
        R3["Review with citation placeholders"]
        R1 --> R2 --> R3
    end

    SUM["5 — Summary"]
    DONE["Review + citations saved<br/>vector store deleted"]

    START --> s1
    s1 --> s2
    s1 --> s3
    s2 -->|"ledger appended to digest<br/>and as a synthetic document"| s3
    s3 --> s4
    s4 --> SUM --> DONE
```

Stages 1–4 are checkpointed per job. If the final review step fails and is retried, `RetryExecutionState` replays the finished extraction, ledger, digest, and vector store rather than paying for them twice.

## Stage 1 — Vision extraction

[api/Services/PromptVisionExtractionService.cs](../api/Services/PromptVisionExtractionService.cs)

Case documents arrive as PDFs, images, and plain text. Rather than parsing PDF text layers — which are missing from scans and unreliable in exports — every non-text page is **rendered to an image and read by a vision model**. That handles scans, photographs, stamps, handwriting, and table layouts through one path, and it means a statement renders the same way whether it came from a bank's PDF export or a phone photo of a printout.

How a document moves through it:

1. **Plain text short-circuits.** Text files are read directly and returned as a single page. No model call.
2. **Cache lookup.** The file content is hashed with SHA-256. The cache key is *content hash + active vision prompt configuration*, not document id, so re-uploading the same file — or a different case uploading an identical one — reuses the earlier extraction. Changing the vision prompt invalidates the cache naturally, because the prompt configuration is part of the key. Extractions are cached in Blob Storage.
3. **PDF → page images.** Docnet renders each page at 2200×3000. Transparent pixels are flattened onto white (`FlattenTransparencyOntoWhite`) so that transparency does not reach the model as black, and each page is encoded as PNG.
4. **One model call per page**, against the chat completions endpoint, sending the page image plus the active `Vision` prompt. Pages are dispatched in batches of `DocumentProcessing:MaxParallelVisionCalls`.
5. **Retry.** Each page retries up to `DocumentProcessing:VisionRetryCount` times with a short escalating delay. Two failures are not retried: cancellation, and a truncated response (`VisionResponseTruncatedException`) — a truncated page means the output token budget was too small, and retrying it unchanged would just truncate again.
6. **Pages are reassembled in order** and written to the cache.

The output is one text block per page, with one-based page numbers preserved. Those page numbers are load-bearing: every later stage cites them, and the transaction extractor validates against them.

Images are single-page by definition. Anything that is not text, image, or PDF is rejected with `NotSupportedException`.

## Stage 2 — Transaction extraction and the financial total

This stage only runs for documents the user marked as **transaction evidence** at upload time. If no document is flagged, it is skipped entirely and the review proceeds without a ledger.

The goal is a defensible total of purchase transactions — one that a person can audit line by line.

**The model extracts; it does not calculate.** Code in [api/Services/StatementLedger.cs](../api/Services/StatementLedger.cs) decides everything that affects the total.

**Extraction units.** Transaction-evidence text is split into units of whole pages, cut at statement boundaries wherever possible (a page that prints "Page 1 of N", or an Account/Activity Summary on a page that is not "Page 2+ of N"). Units never overlap, so a row can only be extracted by one call. Units are capped at `DocumentProcessing:TransactionChunkMaxCharacters`; a statement longer than that is split at page boundaries, never mid-page. If a response is cut off by the output limit, that unit is re-extracted one page at a time.

**What the model returns** for each unit (strict structured output, plus a fixed output contract appended to the `Transaction` prompt):

- **Statements**: one per printed Account/Activity Summary, with its page, account identifier, billing period and every summary figure copied as printed (previous balance, payments, credits, purchases, cash advances, balance transfers, other debits, fees, interest, new balance). Issuers that label purchases "Transactions" (Capital One) are handled through `purchases_label`.
- **Transactions**: every itemized row in every section, including payments, credits, fees, interest and cash advances, each with its page, its position on the page (`row_on_page`), dates, reference number, description, amount as printed and a category (`purchase`, `cash_advance`, `balance_transfer`, `fee`, `interest`, `payment`, `credit`, `other_debit`, `other`). Only `purchase` rows count toward total purchases.
- **Monetary values**: every other printed amount (section totals, credit line, minimum payment, year-to-date totals, Interest Charge Calculation values). These are listed, never added.

**Validation.** Each unit's answer is checked before it is used: pages must be inside the unit, each (page, row) must be unique, categories must be known, and amounts must parse strictly. The parser accepts `$1,234.56`, `-$12.00`, `$12.00CR`, `($12.00)` and rejects anything else, including OCR comma-decimals such as `63,00` that a "strip the commas" parser would read as 6300. A failing unit is retried with the specific problems; if it still fails, only the valid items are kept and every rejected item is listed as a warning.

**Duplicates.** Rows are de-duplicated only on *(document, page, row position)*. Two identical purchases on the same day are two rows and are both counted. A second filed copy of the same statement (same account, period and printed figures, in a different statement block) is shown but not counted again; a summary box printed twice inside one statement is treated as one statement.

**Reconciliation.** Each row is attached to its statement, and for every statement the purchase rows are added up and compared with the printed purchases line. The printed summary is also checked with the balance equation (previous − payments − credits + purchases + transfers + advances + other debits + fees + interest = new balance). A statement that does not match is re-extracted once (`DocumentProcessing:LedgerReconciliationRetryCount`) with the exact mismatch; the retry is kept only if more statements reconcile and none stop reconciling.

| Statement status | Purchases used for the total |
| --- | --- |
| `Reconciled` | Itemized rows (equal to the printed line) |
| `Mismatch` | The printed line if the summary balances, otherwise the itemized rows. Flagged |
| `SummaryOnly` | The printed line (no purchase rows found). Flagged |
| `NoPrintedPurchases` | Itemized rows. Flagged |
| `SummaryDoesNotBalance` | Printed line equals itemized rows, but the summary does not balance. Flagged |
| `DuplicateCopy`, `RepeatedSummary` | Not counted |

Rows in documents with no summary at all (for example a transaction summary list) are counted as itemized rows and flagged as unverifiable. The ledger is `VERIFIED` only when every statement reconciles and there are no warnings; otherwise it is `NEEDS REVIEW` and lists every reason.

**The sum** is computed in C# from parsed `decimal` values. The model never adds anything up.

The result feeds forward three ways: as a synthetic `statement-ledger.txt` document the review can search and cite, as a block appended to the evidence digest, and as a rendered ledger section appended to the final review Markdown.

## Stage 3 — Chunking and evidence analysis

[api/Services/DocumentChunkingService.cs](../api/Services/DocumentChunkingService.cs)

All extracted text — every document, not just transaction evidence — is split into chunks of `DocumentProcessing:EvidenceChunkMaxCharacters` with `DocumentProcessing:ChunkOverlap` characters of overlap. The overlap keeps a fact that straddles a boundary from being lost by both neighbours. (Stage 2 does not use these chunks: it builds its own non-overlapping units.)

Chunks are analyzed in parallel, bounded by a semaphore at `DocumentProcessing:MaxParallelEvidenceCalls`, each with its own retry budget (`EvidenceRetryCount`). The per-chunk analyses are folded into an **evidence digest**: a single cross-document map of what was found and where, which the final review uses as its authoritative source rather than re-reading every chunk. If the digest is marked `INCOMPLETE`, the review is instructed to say so rather than present partial findings as complete.

## Stage 4 — The cited review

Each extracted text file — plus the synthetic ledger, when there is one — is uploaded to the AI service, added to a **vector store**, and the store is polled until it is ready. The review call gets the digest inline and the vector store for file search, so it can go back to the source text for anything the digest summarizes.

Citations are not free text. The model returns structured output containing the review Markdown plus a citations array, and the Markdown carries `<<citation:N>>` placeholders that the platform resolves afterward. Each citation must name a `source_document_id` from the supplied document list and a one-based page number from that document. The model is explicitly forbidden from writing its own Markdown links, so every visible citation traces to a document and page the system can verify. Where nothing supports a claim, the required text is `Not found in the provided documents.` with no citation — an unsupported statement has to be visibly unsupported rather than quietly plausible.

Coverage is validated after rendering (`ValidateCitationCoverage`), and `AzureOpenAI:CaseReviewCitationCorrectionAttempts` bounds how many correction passes a citation problem gets.

The vector store and its uploaded files are **deleted when the run completes**, in a `finally` block. They are working state, not storage.

## Stage 5 — The summary

The finished detailed review — ledger section included — is sent back with the Summary Prompt to produce the short summary shown in the review queue. It is capped by `AzureOpenAI:CaseReviewSummaryMaxOutputTokens`, and it summarizes the review rather than re-reading the documents, so it cannot introduce a claim the cited review does not make.

## Prompts

Prompts live in the database, not in code. Each one is a row in the `prompt` table, and a prompt configuration (`prompt_configuration`) pins a prompt version, a model name, a reasoning effort, and a max output token budget.

Only the case-review **Eligibility Prompt** and **Summary Prompt** are managed through the UI, on the Prompts screen. Saving there creates a new version rather than overwriting the old one. `INSERT.sql` seeds a sample Eligibility Prompt and Summary Prompt so a new installation has a working starting point to edit.

Four prompts are seeded by `INSERT.sql` and have **no screen in the application**: Vision extraction, Transaction extraction, Eligibility prompt generation, and Summary prompt generation. They are edited directly in the `prompt` table. See [System prompts live in the database](SETUP.md#system-prompts-live-in-the-database) for how each one is resolved and how to change it safely.

| Prompt | `prompt_type` | Managed in | Used for |
| --- | --- | --- | --- |
| Vision extraction | `Vision` | `prompt` table | Per-page OCR and layout reading in stage 1 |
| Transaction extraction | `Transaction` | `prompt` table | Structured transaction and monetary-value extraction in stage 2 |
| Eligibility Prompt | `Eligibility` (`main_prompt_text`) | Prompts screen | The detailed review criteria in stage 4 |
| Summary Prompt | `Eligibility` (`summary_prompt_text`) | Prompts screen | The summary in stage 5 |
| Eligibility / Summary prompt generation | `Suggested` | `prompt` table | Generating suggested Eligibility and Summary prompts on the Prompts screen |

Stage 1 and stage 2 each resolve their own active prompt independently and throw if none is configured — a deployment with no active `Vision` or `Transaction` prompt fails loudly at the start of a run rather than silently skipping a stage.

## Tuning knobs

All in `api/appsettings.json`; see [SETUP.md](SETUP.md#configuration-files).

| Key | Effect |
| --- | --- |
| `AzureOpenAI:DefaultModelName` | Model used when a prompt configuration does not name one |
| `AzureOpenAI:DefaultReasoningEffort` | Default reasoning effort |
| `AzureOpenAI:VisionExtractionMaxCompletionTokens` | Per-page vision output budget — too low causes truncation failures on dense pages |
| `AzureOpenAI:CaseReviewMaxOutputTokens` | Output budget for the detailed review |
| `AzureOpenAI:CaseReviewSummaryMaxOutputTokens` | Output budget for the summary |
| `AzureOpenAI:CaseReviewCitationCorrectionAttempts` | How many citation correction passes are allowed |
| `DocumentProcessing:MaxParallelVisionCalls` | Vision pages in flight at once — the main throughput/rate-limit tradeoff |
| `DocumentProcessing:VisionRetryCount` | Retries per page |
| `DocumentProcessing:EvidenceChunkMaxCharacters` | Chunk size |
| `DocumentProcessing:ChunkOverlap` | Overlap between chunks |
| `DocumentProcessing:MaxParallelEvidenceCalls` | Concurrent chunk analyses |
| `DocumentProcessing:EvidenceRetryCount` | Retries per chunk |
| `DocumentProcessing:EvidenceMaxOutputTokens` | Output budget per chunk analysis |
| `DocumentProcessing:TransactionChunkMaxCharacters` | Maximum size of a transaction-extraction unit (default 24,000). Whole statements are packed up to this size |
| `DocumentProcessing:TransactionMaxOutputTokens` | Output budget per transaction-extraction unit (default 32,000). If a response is still cut off, the unit is re-extracted page by page |
| `DocumentProcessing:LedgerReconciliationRetryCount` | Re-extraction passes for statements that do not reconcile (default 1) |
| `AiJobProcessing:JobTimeoutSeconds` | Wall-clock limit for one review job |
| `AiJobProcessing:StaleProcessingTimeoutSeconds` | When a claimed job is considered abandoned and requeued |

If you hit rate limits, lower `MaxParallelVisionCalls` and `MaxParallelEvidenceCalls` before anything else — they control nearly all of the concurrency.

## Tracing in Azure AI Foundry

Every AI step emits an OpenTelemetry span. The API creates them on an `ActivitySource` (`OpenAiExecutionService.ActivitySourceName`), registered in [api/Program.cs](../api/Program.cs) and exported by the Azure Monitor distro to the Application Insights resource named in `AzureMonitor:ConnectionString`.

### What to look for

| Span | Emitted when |
| --- | --- |
| `case_review.execute` | Root span for one review — tags the prompt configuration, version, and document count |
| `openai.vision` | One per page image sent to the vision model |
| `workflow.calculate_purchase_total` | The financial calculation — the whole audit trail is on this span |
| `openai.responses` | Any model call carrying prompt context (transaction extraction, chunk analysis, review, summary) |
| `openai.files.upload` | Extracted text file uploaded |
| `openai.vector_store.create` / `.file.add` / `.status` | Vector store setup and readiness polling |
| `suggested_prompt.generate` | Administrator-triggered prompt suggestion, outside the review flow |

### Seeing prompts and responses

Prompt and response text is **off by default**. Turn it on with:

```json
"AzureMonitor": {
  "TraceOpenAIPayloads": true,
  "TracePayloadMaxChars": 8000
}
```
### Querying it directly

The Foundry and Application Insights UIs are the easy path; Logs (KQL) is the precise one. Spans land in `dependencies`, span events in `traces`, correlated by `operation_Id`.

One review, start to finish:

```kusto
dependencies
| where name startswith "case_review" or name startswith "openai" or name startswith "workflow"
| where operation_Id == "<operation id>"
| project timestamp, name, duration, success, customDimensions
| order by timestamp asc
```

Slowest vision pages:

```kusto
dependencies
| where name == "openai.vision"
| top 20 by duration desc
| project timestamp, duration,
    file = tostring(customDimensions["document.file_name"]),
    bytes = tostring(customDimensions["vision.image_size_bytes"])
```
