//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

public class ReviewService : IReviewService
{
    private const string CompletedStatus = "COMPLETED";
    private const string LegacyTestOutputPrefix = "TEST OUTPUT:";

    private readonly DivertCheckDbContext _db;

    public ReviewService(DivertCheckDbContext db)
    {
        _db = db;
    }

    public async Task<IEnumerable<ReviewQueueItemViewModel>> GetReviewQueueAsync(CancellationToken cancellationToken = default)
    {
        var latestReviews = await CreateLatestResponsesByCaseQuery()
            .OrderBy(response => response.Case.CaseName)
            .ThenByDescending(response => response.CreatedDttm)
            .ThenByDescending(response => response.AiResponseId)
            .Select(response => new ReviewQueueRow(
                response.AiResponseId,
                response.CaseId,
                response.ReviewVersion,
                response.Case.CaseName,
                response.Case.CaseNumber,
                response.Case.FilingDate,
                response.CompletedAt,
                response.CreatedDttm,
                response.AiStatus,
                response.AiSummaryResponse,
                response.AiResponseDocuments
                    .Where(link => link.IsRecordActive && link.Document.IsRecordActive)
                    .OrderByDescending(link => link.CreatedDttm)
                    .ThenByDescending(link => link.AiResponseDocumentId)
                    .Select(link => new ReviewQueueDocumentViewModel(
                        link.AiResponseDocumentId,
                        link.DocumentId,
                        link.Document.DocumentName,
                        $"/api/v1/Cases/documents/{link.DocumentId}/content"))
                    .ToArray()))
            .ToListAsync(cancellationToken);

        return latestReviews
            .Select(response => response.ToViewModel())
            .ToArray();
    }

    public async Task<CaseReviewDetailViewModel?> GetCaseReviewByAiResponseIdAsync(long aiResponseId, CancellationToken cancellationToken = default)
    {
        CaseReviewDetailViewModel? response;

        try
        {
            response = await CreateActiveResponsesQuery()
                .Where(response => response.AiResponseId == aiResponseId)
                .Select(response => new CaseReviewDetailViewModel(
                    response.AiResponseId,
                    response.CaseId,
                    response.ReviewVersion,
                    response.Case.CaseName,
                    response.Case.CaseNumber,
                    response.Case.FilingDate,
                    response.CompletedAt,
                    response.CreatedDttm,
                    response.AiStatus,
                    response.PromptConfigurationId,
                    response.PromptConfiguration.PromptVersion,
                    response.PromptConfiguration.AiModelName,
                    response.PromptConfiguration.ReasoningEffort,
                    response.AiSummaryResponse,
                    response.AiFullResponse,
                    response.AiResponseDocuments
                        .Where(link => link.IsRecordActive && link.Document.IsRecordActive)
                        .OrderBy(link => link.Document.DocumentName)
                        .Select(link => new ReviewedDocumentViewModel(
                            link.AiResponseDocumentId,
                            link.DocumentId,
                            $"/api/v1/Cases/documents/{link.DocumentId}/content",
                            link.Document.DocumentName,
                            link.Document.FileSize,
                            link.Document.CodeValue != null
                                ? link.Document.CodeValue.ShortDescription
                                : link.Document.SubmittedBy,
                            link.Document.IsFinancialDocument))
                        .ToArray(),
                    Array.Empty<ReviewCitationViewModel>()))
                .FirstOrDefaultAsync(cancellationToken);
        }
        catch (Exception)
        {
            throw;
        }

        if (response == null)
            return null;

        /*
           scheduled_at lives on the job row and is timestamptz, while created_dttm is a plain
           timestamp, so Postgres cannot COALESCE the two inside the projection above. Read the
           job separately and fall back to the response's created_dttm when no job row exists.
        */
        var scheduledAt = await _db.AiJobQueues
            .AsNoTracking()
            .Where(job => job.AiResponseId == aiResponseId && job.IsRecordActive)
            .OrderByDescending(job => job.ScheduledAt)
            .ThenByDescending(job => job.JobId)
            .Select(job => (DateTime?)job.ScheduledAt)
            .FirstOrDefaultAsync(cancellationToken);

        var enrichedReview = ReviewCitationService.Enrich(
            response.SummaryAiReview,
            response.FullAiReview,
            response.Documents);

        return response with
        {
            ScheduledAt = scheduledAt ?? response.ScheduledAt,
            SummaryAiReview = enrichedReview.Summary,
            FullAiReview = enrichedReview.FullReview,
            Citations = enrichedReview.Citations
        };
    }

    public async Task<IEnumerable<ReviewHistoryItemViewModel>> GetCaseReviewHistoryAsync(
        long caseId,
        CancellationToken cancellationToken = default)
    {
        var reviews = await GetChronologicalReviewsAsync(caseId, cancellationToken);
        var currentAiResponseId = GetCurrentReviewId(reviews);

        return reviews
            .Select(response => new ReviewHistoryItemViewModel(
                response.AiResponseId,
                response.CaseId,
                response.ReviewVersion,
                response.CompletedAt ?? response.CreatedDttm,
                response.AiStatus,
                response.PromptConfigurationId,
                response.PromptVersion,
                response.AiModelName,
                response.ReasoningEffort,
                response.AiResponseId == currentAiResponseId))
            .OrderByDescending(response => response.ReviewVersion)
            .ToArray();
    }

    public async Task<CaseReviewDetailViewModel?> GetCaseReviewByVersionAsync(
        long caseId,
        int reviewVersion,
        CancellationToken cancellationToken = default)
    {
        if (reviewVersion < 1)
            return null;

        var matchingResponse = (await GetChronologicalReviewsAsync(caseId, cancellationToken))
            .FirstOrDefault(response => response.ReviewVersion == reviewVersion);

        return matchingResponse == null
            ? null
            : await GetCaseReviewByAiResponseIdAsync(matchingResponse.AiResponseId, cancellationToken);
    }

    /* Builds the queue from the newest review per case so the controller
       can stay agnostic to the latest-review selection logic. */
    private IQueryable<AiResponse> CreateLatestResponsesByCaseQuery()
    {
        var latestResponseIdsByCase = CreateActiveResponsesQuery()
            .GroupBy(response => response.CaseId)
            .Select(group => group
                .OrderByDescending(response =>
                    response.AiStatus == CompletedStatus &&
                    (
                        (!string.IsNullOrWhiteSpace(response.AiFullResponse) &&
                         !EF.Functions.Like(response.AiFullResponse, $"{LegacyTestOutputPrefix}%")) ||
                        (!string.IsNullOrWhiteSpace(response.AiSummaryResponse) &&
                         !EF.Functions.Like(response.AiSummaryResponse, $"{LegacyTestOutputPrefix}%"))
                    ))
                .ThenByDescending(response => response.CompletedAt)
                .ThenByDescending(response => response.CreatedDttm)
                .ThenByDescending(response => response.AiResponseId)
                .Select(response => response.AiResponseId)
                .First());

        return CreateActiveResponsesQuery()
            .Where(response => latestResponseIdsByCase.Contains(response.AiResponseId));
    }

    private IQueryable<AiResponse> CreateActiveResponsesQuery()
    {
        return _db.AiResponses
            .AsNoTracking()
            .Where(response => response.IsRecordActive && response.Case.IsRecordActive);
    }

    private async Task<List<ReviewChronologyRow>> GetChronologicalReviewsAsync(
        long caseId,
        CancellationToken cancellationToken)
    {
        return await CreateActiveResponsesQuery()
            .Where(response =>
                response.CaseId == caseId &&
                response.AiStatus == CompletedStatus &&
                response.ReviewVersion > 0)
            .OrderBy(response => response.ReviewVersion)
            .ThenBy(response => response.CreatedDttm)
            .ThenBy(response => response.AiResponseId)
            .Select(response => new ReviewChronologyRow(
                response.AiResponseId,
                response.CaseId,
                response.ReviewVersion,
                response.CreatedDttm,
                response.CompletedAt,
                response.AiStatus,
                response.PromptConfigurationId,
                response.PromptConfiguration.PromptVersion,
                response.PromptConfiguration.AiModelName,
                response.PromptConfiguration.ReasoningEffort))
            .ToListAsync(cancellationToken);
    }

    private static long? GetCurrentReviewId(IEnumerable<ReviewChronologyRow> reviews)
    {
        return reviews
            .OrderByDescending(response => response.CompletedAt)
            .ThenByDescending(response => response.CreatedDttm)
            .ThenByDescending(response => response.AiResponseId)
            .Select(response => (long?)response.AiResponseId)
            .FirstOrDefault();
    }

    private sealed record ReviewQueueRow(
        long AiResponseId,
        long CaseId,
        int ReviewVersion,
        string CaseName,
        string CaseNumber,
        DateOnly? FilingDate,
        DateTime? CompletedAt,
        DateTime CreatedDttm,
        string AiStatus,
        string? Summary,
        IReadOnlyCollection<ReviewQueueDocumentViewModel> Documents)
    {
        public ReviewQueueItemViewModel ToViewModel()
        {
            return new ReviewQueueItemViewModel(
                AiResponseId,
                CaseId,
                ReviewVersion,
                CaseName,
                CaseNumber,
                FilingDate,
                CompletedAt,
                CreatedDttm,
                AiStatus,
                Summary,
                Documents);
        }
    }

    private sealed record ReviewChronologyRow(
        long AiResponseId,
        long CaseId,
        int ReviewVersion,
        DateTime CreatedDttm,
        DateTime? CompletedAt,
        string AiStatus,
        long PromptConfigurationId,
        int PromptVersion,
        string AiModelName,
        string? ReasoningEffort);

}

