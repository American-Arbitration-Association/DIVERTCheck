//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Text.RegularExpressions;
using api.ViewModels;

namespace api.Services;

internal static partial class ReviewCitationService
{
    private const int MaxPagesPerCitation = 50;

    public static CitationValidationResult ValidateRequiredCitationCoverage(
        string review,
        IEnumerable<string> sourceDocumentNames)
    {
        var sourceNames = sourceDocumentNames
            .SelectMany(name => new[]
            {
                NormalizeDocumentName(name),
                NormalizeDocumentName(Path.GetFileNameWithoutExtension(name))
            })
            .ToHashSet(StringComparer.Ordinal);

        var inSummary = false;
        var inEvidence = false;
        var errors = new List<string>();
        var requiredLineCount = 0;

        var lineNumber = 0;
        foreach (var rawLine in review.Split('\n'))
        {
            lineNumber++;
            var line = rawLine.Trim();
            if (IsMarkdownHeading(line))
            {
                inSummary = IsSummaryHeading(line);
                inEvidence = false;
            }

            if (IsEvidenceHeading(line))
            {
                inEvidence = true;
                continue;
            }

            if (line.Equals("---", StringComparison.Ordinal))
            {
                inSummary = false;
                inEvidence = false;
                continue;
            }

            if (IsNamedSectionHeading(line))
                inEvidence = false;

            var requiresCitation =
                (inSummary && line.StartsWith("- ", StringComparison.Ordinal)) ||
                (inEvidence && line.StartsWith("- ", StringComparison.Ordinal)) ||
                line.StartsWith("- **Finding:**", StringComparison.OrdinalIgnoreCase) ||
                line.StartsWith("- **Evidence:**", StringComparison.OrdinalIgnoreCase);
            if (!requiresCitation || IsMissingEvidenceStatement(line))
                continue;

            requiredLineCount++;
            var citations = CitationPattern().Matches(line);
            if (citations.Count == 0)
            {
                errors.Add($"Line {lineNumber} requires a document/page citation but has none.");
                continue;
            }

            foreach (Match citation in citations)
            {
                if (!sourceNames.Contains(NormalizeDocumentName(citation.Groups["document"].Value)))
                    errors.Add($"Line {lineNumber} cites a document name that is not in the available source list.");
            }
        }

        if (requiredLineCount == 0)
            errors.Add("The review contains no factual Summary, Finding, or Evidence line with a citation.");

        return new CitationValidationResult(errors.Count == 0, errors);
    }

    public sealed record CitationValidationResult(bool IsValid, IReadOnlyList<string> Errors);

    private static bool IsMissingEvidenceStatement(string line)
    {
        var content = line.TrimStart('-', ' ');
        var labelEnd = content.IndexOf(":**", StringComparison.Ordinal);
        if (labelEnd >= 0)
            content = content[(labelEnd + 3)..].Trim();

        return content.Equals(
            "Not found in the provided documents.",
            StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsMarkdownHeading(string line) =>
        line.StartsWith("#", StringComparison.Ordinal);

    private static bool IsSummaryHeading(string line) =>
        line.TrimStart('#', ' ').Equals("Summary", StringComparison.OrdinalIgnoreCase);

    private static bool IsEvidenceHeading(string line) =>
        line.Equals("**Evidence:**", StringComparison.OrdinalIgnoreCase) ||
        line.Equals("Evidence:", StringComparison.OrdinalIgnoreCase);

    private static bool IsNamedSectionHeading(string line) =>
        line.StartsWith("**Analysis:**", StringComparison.OrdinalIgnoreCase) ||
        line.StartsWith("**Finding:**", StringComparison.OrdinalIgnoreCase) ||
        line.StartsWith("**Criteria", StringComparison.OrdinalIgnoreCase) ||
        line.StartsWith("Transaction Table:", StringComparison.OrdinalIgnoreCase) ||
        line.StartsWith("Issues/Flags:", StringComparison.OrdinalIgnoreCase);

    public static (
        string? Summary,
        string? FullReview,
        IReadOnlyCollection<ReviewCitationViewModel> Citations) Enrich(
        string? summary,
        string? fullReview,
        IReadOnlyCollection<ReviewedDocumentViewModel> documents)
    {
        var citations = new Dictionary<(long DocumentId, int PageNumber), ReviewCitationViewModel>();
        var linkedSummary = AddCitationLinks(summary, documents, citations);
        var linkedFullReview = AddCitationLinks(fullReview, documents, citations);

        return (
            linkedSummary,
            linkedFullReview,
            citations.Values.ToArray());
    }

    private static string? AddCitationLinks(
        string? review,
        IReadOnlyCollection<ReviewedDocumentViewModel> documents,
        IDictionary<(long DocumentId, int PageNumber), ReviewCitationViewModel> citations)
    {
        if (string.IsNullOrWhiteSpace(review) || documents.Count == 0)
            return review;

        return CitationPattern().Replace(review, match =>
        {
            var matchingDocument = ResolveDocument(match.Groups["document"].Value, documents);
            var pageNumbers = ParsePageNumbers(match.Groups["pages"].Value);
            if (matchingDocument == null || pageNumbers.Count == 0)
                return match.Value;

            var links = pageNumbers.Select(pageNumber =>
                AddCitation(matchingDocument, pageNumber, citations));

            return string.Join(", ", links);
        });
    }

    private static string AddCitation(
        ReviewedDocumentViewModel document,
        int pageNumber,
        IDictionary<(long DocumentId, int PageNumber), ReviewCitationViewModel> citations)
    {
        var label = $"{Path.GetFileNameWithoutExtension(document.DocumentName)} page {pageNumber}";
        var url = $"{document.DocumentUrl}#page={pageNumber}";
        var markdownLink = $"[{EscapeMarkdownLabel(label)}]({url})";
        citations.TryAdd((document.DocumentId, pageNumber), new ReviewCitationViewModel(
            document.DocumentId,
            document.DocumentName,
            pageNumber,
            label,
            url,
            markdownLink));
        return markdownLink;
    }

    private static IReadOnlyList<int> ParsePageNumbers(string pageSpecification)
    {
        var pages = new List<int>();
        foreach (Match range in PageRangePattern().Matches(pageSpecification))
        {
            if (!int.TryParse(range.Groups["start"].Value, out var start))
                return Array.Empty<int>();

            var end = start;
            if (range.Groups["end"].Success &&
                !int.TryParse(range.Groups["end"].Value, out end))
                return Array.Empty<int>();

            if (start < 1 || end < start)
                return Array.Empty<int>();

            for (var page = start; page <= end; page++)
            {
                if (pages.Contains(page))
                    continue;
                if (pages.Count == MaxPagesPerCitation)
                    return Array.Empty<int>();

                pages.Add(page);
            }
        }

        return pages;
    }

    private static ReviewedDocumentViewModel? ResolveDocument(
        string citedDocumentName,
        IReadOnlyCollection<ReviewedDocumentViewModel> documents)
    {
        if (TryParseDocumentReference(citedDocumentName, out var documentId))
            return documents.SingleOrDefault(document => document.DocumentId == documentId);

        var normalizedCitation = NormalizeDocumentName(citedDocumentName);
        var matches = documents
            .Where(document =>
                NormalizeDocumentName(document.DocumentName) == normalizedCitation ||
                NormalizeDocumentName(Path.GetFileNameWithoutExtension(document.DocumentName)) == normalizedCitation)
            .Take(2)
            .ToArray();

        return matches.Length == 1 ? matches[0] : null;
    }

    private static bool TryParseDocumentReference(string value, out long documentId)
    {
        const string prefix = "document-";
        var normalized = value.Trim();
        if (!normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            documentId = 0;
            return false;
        }

        return long.TryParse(normalized[prefix.Length..], out documentId) && documentId > 0;
    }

    private static string NormalizeDocumentName(string documentName)
    {
        var fileName = Path.GetFileName(documentName.Trim().Trim('"', '\''));
        if (fileName.EndsWith(".extracted.txt", StringComparison.OrdinalIgnoreCase))
            fileName = fileName[..^".extracted.txt".Length];

        return fileName.Trim().ToUpperInvariant();
    }

    private static string EscapeMarkdownLabel(string label) =>
        label.Replace("\\", "\\\\").Replace("[", "\\[").Replace("]", "\\]");

    [GeneratedRegex(
        @"(?:\[(?<document>[^\]\r\n]+?),\s*pages?\s+(?<pages>\d+(?:\s*[-–—]\s*\d+)?(?:\s*(?:,|,?\s+and)\s*\d+(?:\s*[-–—]\s*\d+)?)*)\]|\((?<document>[^\)\r\n]+?),\s*pages?\s+(?<pages>\d+(?:\s*[-–—]\s*\d+)?(?:\s*(?:,|,?\s+and)\s*\d+(?:\s*[-–—]\s*\d+)?)*)\))(?!\()",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CitationPattern();

    [GeneratedRegex(@"(?<start>\d+)(?:\s*[-–—]\s*(?<end>\d+))?")]
    private static partial Regex PageRangePattern();
}
