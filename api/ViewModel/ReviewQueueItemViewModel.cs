//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record ReviewQueueItemViewModel(
    long AiResponseId,
    long CaseId,
    int ReviewVersion,
    string CaseName,
    string CaseNumber,
    DateOnly? FilingDate,
    DateTime? ReviewDate,
    DateTime CreatedAt,
    string AiStatus,
    string? Summary,
    IReadOnlyCollection<ReviewQueueDocumentViewModel> Documents);
