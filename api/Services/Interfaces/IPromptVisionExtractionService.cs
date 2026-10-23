//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;

namespace api.Services.Interfaces;

public interface IPromptVisionExtractionService
{
    Task<ExtractedDocumentText> ExtractDocumentAsync(
        string fileName,
        string? contentType,
        byte[] content,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default);

    Task<string> ExtractDocumentTextAsync(
        string fileName,
        string? contentType,
        byte[] content,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default);

    Task<string> ExtractDocumentTextAsync(
        IFormFile file,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default);
}

public sealed record ExtractedDocumentText(
    string FileName,
    IReadOnlyList<ExtractedDocumentPage> Pages);

public sealed record ExtractedDocumentPage(
    int PageNumber,
    string Text);
