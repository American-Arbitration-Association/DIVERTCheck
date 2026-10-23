//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Text.Json;

namespace api.ViewModels;

public sealed record AiJobStatusViewModel(
    long JobId,
    string JobType,
    string JobStatus,
    int Attempts,
    DateTime ScheduledAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string? ErrorMessage,
    string? LastFailureMessage,
    long? AiResponseId,
    long? PromptSuggestionResponseId);
