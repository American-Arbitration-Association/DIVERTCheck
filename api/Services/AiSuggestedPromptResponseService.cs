//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

public sealed class AiSuggestedPromptResponseService : IAiSuggestedPromptResponseService
{
    private readonly DivertCheckDbContext _db;

    public AiSuggestedPromptResponseService(DivertCheckDbContext db)
    {
        _db = db;
    }

    public async Task<AiSuggestedPromptResponseViewModel?> GetSuggestedPromptResponseAsync(
        long promptSuggestionResponseId,
        CancellationToken cancellationToken = default)
    {
        if (promptSuggestionResponseId <= 0)
            throw new ArgumentException("A valid prompt suggestion response id is required.", nameof(promptSuggestionResponseId));

        return await _db.PromptSuggestionResponses
            .AsNoTracking()
            .Where(response =>
                response.PromptSuggestionResponseId == promptSuggestionResponseId &&
                response.IsRecordActive)
            .Select(response => new AiSuggestedPromptResponseViewModel(
                response.PromptSuggestionResponseId,
                response.PromptConfigurationId,
                response.PromptType,
                response.AiStatus,
                response.GeneratedPrompt,
                response.RawResponse,
                response.CreatedDttm,
                response.ModifiedDttm))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
