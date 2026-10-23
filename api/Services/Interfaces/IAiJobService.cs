//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;

namespace api.Services.Interfaces;

public interface IAiJobService
{
    Task<QueueAiJobResponseViewModel> QueueCaseJobAsync(
        long caseId,
        QueueAiJobRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<AiJobStatusViewModel> QueueSuggestedPromptJobAsync(
        GeneratePromptReviewRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<AiJobStatusViewModel> GetJobStatusAsync(
        long jobId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<long>> GetQueuedJobIdsAsync(
        int batchSize,
        CancellationToken cancellationToken = default);

    Task<int> RequeueStalledProcessingJobsAsync(
        TimeSpan staleAfter,
        CancellationToken cancellationToken = default);

    Task ProcessJobAsync(
        long jobId,
        CancellationToken cancellationToken = default);

    Task<CancelAiJobResponseViewModel> CancelJobAsync(
        long jobId,
        CancellationToken cancellationToken = default);
}
