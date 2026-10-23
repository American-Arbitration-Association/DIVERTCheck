//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;

namespace api.Services.Interfaces;

public interface IReviewService
{
    Task<IEnumerable<ReviewQueueItemViewModel>> GetReviewQueueAsync(CancellationToken cancellationToken = default);

    Task<CaseReviewDetailViewModel?> GetCaseReviewByAiResponseIdAsync(
        long aiResponseId,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<ReviewHistoryItemViewModel>> GetCaseReviewHistoryAsync(
        long caseId,
        CancellationToken cancellationToken = default);

    Task<CaseReviewDetailViewModel?> GetCaseReviewByVersionAsync(
        long caseId,
        int reviewVersion,
        CancellationToken cancellationToken = default);
}
