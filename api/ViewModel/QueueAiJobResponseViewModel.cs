//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record QueueAiJobResponseViewModel(
    long JobId,
    long AiResponseId,
    string AiResponseStatus,
    string JobStatus,
    long CaseId,
    IReadOnlyCollection<long> DocumentIds,
    DateTime ScheduledAt,
    IReadOnlyCollection<DocumentUploadResultViewModel>? UploadedDocuments = null,
    IReadOnlyCollection<CaseDocumentListItemViewModel>? Documents = null);
