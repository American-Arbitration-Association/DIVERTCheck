//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;

namespace api.Services.Interfaces;

public interface IAiExecutionService
{
    Task<AiExecutionResult> ExecuteCaseReviewAsync(
        PromptConfiguration promptConfiguration,
        IReadOnlyCollection<AiDocumentContent> documents,
        long? jobId = null,
        CancellationToken cancellationToken = default);

    Task DiscardRetryStateAsync(long jobId, CancellationToken cancellationToken = default);

    Task<string> GenerateSuggestedPromptReviewAsync(
        PromptConfiguration promptConfiguration,
        string suggestedPromptGenerationPrompt,
        string promptTarget,
        string? fileName,
        string documentText,
        CancellationToken cancellationToken = default);
}

public sealed record AiDocumentContent(
    long DocumentId,
    string FileName,
    string ContentType,
    byte[] Content,
    string? DocumentType = null,
    bool IsTransactionEvidenceDocument = false);
