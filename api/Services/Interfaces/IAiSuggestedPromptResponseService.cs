//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;

namespace api.Services.Interfaces;

public interface IAiSuggestedPromptResponseService
{
    Task<AiSuggestedPromptResponseViewModel?> GetSuggestedPromptResponseAsync(
        long promptSuggestionResponseId,
        CancellationToken cancellationToken = default);
}
