//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed class QueueAiJobRequestViewModel
{
    public string JobType { get; init; } = null!;

    public long? PromptConfigurationId { get; init; }

    public IReadOnlyCollection<long>? DocumentIds { get; init; }

    public IReadOnlyCollection<long>? UploadedDocumentIds { get; init; }

    public short? JobPriority { get; init; }

    public int? MaxAttempts { get; init; }

    public long? CreatedUser { get; init; }
}
