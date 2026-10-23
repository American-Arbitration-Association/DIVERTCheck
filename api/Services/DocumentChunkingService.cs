//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Text;
using api.Services.Interfaces;

namespace api.Services;

internal static class DocumentChunkingService
{
    public static IReadOnlyList<DocumentEvidenceChunk> CreateChunks(
        IReadOnlyCollection<EvidenceDocument> documents,
        int maxCharacters,
        int chunkOverlap)
    {
        if (maxCharacters < 2_000)
            throw new ArgumentOutOfRangeException(nameof(maxCharacters), "Evidence chunks must allow at least 2,000 characters.");
        if (chunkOverlap < 0 || chunkOverlap >= maxCharacters)
            throw new ArgumentOutOfRangeException(nameof(chunkOverlap));

        var chunks = new List<DocumentEvidenceChunk>();
        foreach (var document in documents)
            AddDocumentChunks(document, chunks, maxCharacters, chunkOverlap);

        return chunks;
    }

    public static string FormatCanonicalText(ExtractedDocumentText document)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"=== DOCUMENT: {document.FileName} ===");

        foreach (var page in document.Pages.OrderBy(page => page.PageNumber))
            AppendPage(builder, page.PageNumber, page.Text);

        return builder.ToString().Trim();
    }

    public static EvidenceDigest BuildDigest(
        IReadOnlyCollection<EvidenceDocument> documents,
        IReadOnlyCollection<DocumentEvidenceChunk> chunks,
        IReadOnlyCollection<DocumentChunkAnalysis> analyses)
    {
        var expectedIds = chunks.Select(chunk => chunk.ChunkId).ToHashSet(StringComparer.Ordinal);
        var completedIds = analyses.Select(analysis => analysis.ChunkId).ToHashSet(StringComparer.Ordinal);
        var missingIds = expectedIds.Except(completedIds, StringComparer.Ordinal).Order().ToArray();
        var incomplete = analyses.Where(analysis => !analysis.Complete).Select(analysis => analysis.ChunkId).Order().ToArray();
        var warnings = analyses.SelectMany(analysis => analysis.Warnings).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct().ToArray();

        var findings = analyses
            .SelectMany(analysis => analysis.Findings)
            .Where(IsUsableFinding)
            .DistinctBy(BuildFindingKey)
            .OrderBy(finding => finding.SourceFileName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(finding => finding.SourcePage)
            .ToArray();

        var builder = new StringBuilder();
        builder.AppendLine("CASE EVIDENCE DIGEST");
        builder.AppendLine();
        builder.AppendLine("PROCESSING STATUS");
        foreach (var document in documents)
        {
            builder.AppendLine(
                $"- {document.SourceFileName}: {document.Extraction.Pages.Count} page(s), profile {document.ProcessingProfile}");
        }
        builder.AppendLine($"- Chunk analysis: {completedIds.Count}/{expectedIds.Count} completed");
        builder.AppendLine($"- Overall status: {(missingIds.Length == 0 && incomplete.Length == 0 ? "COMPLETE" : "INCOMPLETE")}");

        if (missingIds.Length > 0)
            builder.AppendLine($"- Missing chunks: {string.Join(", ", missingIds)}");
        if (incomplete.Length > 0)
            builder.AppendLine($"- Incomplete chunks: {string.Join(", ", incomplete)}");
        foreach (var warning in warnings)
            builder.AppendLine($"- Warning: {warning.Trim()}");

        builder.AppendLine();
        builder.AppendLine("FINDINGS");
        if (findings.Length == 0)
        {
            builder.AppendLine("No criteria-relevant findings were extracted from the document chunks.");
        }
        else
        {
            foreach (var group in findings.GroupBy(finding => finding.SourceFileName, StringComparer.OrdinalIgnoreCase))
            {
                builder.AppendLine();
                builder.AppendLine($"DOCUMENT: {group.Key.Trim()}");
                foreach (var finding in group)
                {
                    builder.AppendLine($"- Finding: {finding.Finding.Trim()}");
                    builder.AppendLine($"  Source: {finding.SourceFileName}, page {finding.SourcePage}");
                    builder.AppendLine($"  Evidence: {finding.SourceQuote.Trim()}");
                    builder.AppendLine($"  Confidence: {finding.Confidence.Trim()}");
                }
            }
        }

        return new EvidenceDigest(
            builder.ToString().Trim(),
            missingIds.Length == 0 && incomplete.Length == 0);
    }

    private static void AddDocumentChunks(
        EvidenceDocument document,
        ICollection<DocumentEvidenceChunk> destination,
        int maxCharacters,
        int chunkOverlap)
    {
        var currentPages = new List<ExtractedDocumentPage>();
        var currentLength = 0;
        var ordinal = 1;

        foreach (var page in document.Extraction.Pages.OrderBy(page => page.PageNumber))
        {
            var formattedPage = FormatPage(page.PageNumber, page.Text);
            if (formattedPage.Length > maxCharacters)
            {
                FlushPages(document, destination, currentPages, ref ordinal);
                currentLength = 0;
                AddOversizedPageChunks(
                    document,
                    page,
                    destination,
                    maxCharacters,
                    chunkOverlap,
                    ref ordinal);
                continue;
            }

            if (currentPages.Count > 0 && currentLength + formattedPage.Length > maxCharacters)
            {
                FlushPages(document, destination, currentPages, ref ordinal);
                currentLength = 0;
            }

            currentPages.Add(page);
            currentLength += formattedPage.Length;
        }

        FlushPages(document, destination, currentPages, ref ordinal);
    }

    private static void AddOversizedPageChunks(
        EvidenceDocument document,
        ExtractedDocumentPage page,
        ICollection<DocumentEvidenceChunk> destination,
        int maxCharacters,
        int overlapCharacters,
        ref int ordinal)
    {
        var headerLength = FormatPage(page.PageNumber, string.Empty).Length;
        var contentLimit = Math.Max(1, maxCharacters - headerLength);
        var effectiveOverlap = Math.Min(overlapCharacters, contentLimit - 1);
        var offset = 0;

        while (offset < page.Text.Length)
        {
            var length = Math.Min(contentLimit, page.Text.Length - offset);
            var content = page.Text.Substring(offset, length);
            destination.Add(new DocumentEvidenceChunk(
                BuildChunkId(document.DocumentId, ordinal++),
                document.DocumentId,
                document.SourceFileName,
                page.PageNumber,
                page.PageNumber,
                FormatPage(page.PageNumber, content)));

            if (offset + length >= page.Text.Length)
                break;
            offset += length - effectiveOverlap;
        }
    }

    private static void FlushPages(
        EvidenceDocument document,
        ICollection<DocumentEvidenceChunk> destination,
        List<ExtractedDocumentPage> pages,
        ref int ordinal)
    {
        if (pages.Count == 0)
            return;

        destination.Add(new DocumentEvidenceChunk(
            BuildChunkId(document.DocumentId, ordinal++),
            document.DocumentId,
            document.SourceFileName,
            pages[0].PageNumber,
            pages[^1].PageNumber,
            string.Join(Environment.NewLine, pages.Select(page => FormatPage(page.PageNumber, page.Text)))));
        pages.Clear();
    }

    private static string BuildChunkId(long documentId, int ordinal) => $"document-{documentId}-chunk-{ordinal:D4}";

    private static string FormatPage(int pageNumber, string text)
    {
        var builder = new StringBuilder();
        AppendPage(builder, pageNumber, text);
        return builder.ToString();
    }

    private static void AppendPage(StringBuilder builder, int pageNumber, string text)
    {
        builder.AppendLine($"=== PAGE {pageNumber} START ===");
        builder.AppendLine(text.Trim());
        builder.AppendLine($"=== PAGE {pageNumber} END ===");
    }

    private static bool IsUsableFinding(DocumentEvidenceFinding finding) =>
        !string.IsNullOrWhiteSpace(finding.Finding) &&
        !string.IsNullOrWhiteSpace(finding.SourceFileName) &&
        finding.SourcePage > 0 &&
        !string.IsNullOrWhiteSpace(finding.SourceQuote);

    private static string BuildFindingKey(DocumentEvidenceFinding finding) => string.Join(
        '|',
        Normalize(finding.SourceFileName),
        finding.SourcePage,
        Normalize(finding.Finding),
        Normalize(finding.SourceQuote));

    private static string Normalize(string value) =>
        string.Join(' ', value.Trim().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}

internal sealed record EvidenceDocument(
    long DocumentId,
    string SourceFileName,
    string TextFileName,
    string ProcessingProfile,
    ExtractedDocumentText Extraction,
    bool IsTransactionEvidenceDocument);

internal sealed record DocumentEvidenceChunk(
    string ChunkId,
    long DocumentId,
    string SourceFileName,
    int PageStart,
    int PageEnd,
    string Text);

internal sealed record DocumentChunkAnalysis(
    string ChunkId,
    IReadOnlyList<DocumentEvidenceFinding> Findings,
    IReadOnlyList<string> Warnings,
    bool Complete);

internal sealed record DocumentEvidenceFinding(
    string Finding,
    string SourceFileName,
    int SourcePage,
    string SourceQuote,
    string Confidence);

internal sealed record EvidenceDigest(
    string Text,
    bool Complete);
