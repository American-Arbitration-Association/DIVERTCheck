//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record CaseReviewDetailViewModel(
    long AiResponseId,
    long CaseId,
    int ReviewVersion,
    string CaseName,
    string CaseNumber,
    DateOnly? FilingDate,
    DateTime? ReviewDate,
    DateTime ScheduledAt,
    string AiStatus,
    long PromptConfigurationId,
    int PromptVersion,
    string AiModelName,
    string? ReasoningEffort,
    string? SummaryAiReview,
    string? FullAiReview,
    IReadOnlyCollection<ReviewedDocumentViewModel> Documents,
    IReadOnlyCollection<ReviewCitationViewModel> Citations);

public sealed record ReviewCitationViewModel(
    long DocumentId,
    string DocumentName,
    int PageNumber,
    string Label,
    string Url,
    string MarkdownLink);
