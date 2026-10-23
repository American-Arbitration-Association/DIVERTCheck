//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;

namespace api.Services.Interfaces;

public interface IPromptConfigurationService
{
    Task<PromptConfigurationPageViewModel> GetCurrentConfigurationAsync(CancellationToken cancellationToken = default);

    Task<PromptConfigurationPageViewModel> GetPromptConfigurationAsync(long promptConfigurationId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<PromptVersionListItemViewModel>> GetPromptVersionHistoryAsync(
        CancellationToken cancellationToken = default);

    Task<SetAsCurrentPromptConfigurationResponseViewModel> SetAsCurrentPromptConfigurationAsync(
        long promptConfigurationId,
        CancellationToken cancellationToken = default);

    Task<ReferenceDocumentPromptReviewViewModel> GenerateSuggestedPromptAsync(
        GeneratePromptReviewRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<ReplacePromptConfigurationResponseViewModel> SaveConfigurationAsync(
        ReplacePromptConfigurationRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<UndoPromptTextUpdateResponseViewModel> UndoPromptTextUpdateAsync(
        UndoPromptTextUpdateRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<ReplacePromptConfigurationResponseViewModel> UndoReplaceCurrentPromptAsync(
        UndoPromptConfigurationRequestViewModel request,
        CancellationToken cancellationToken = default);
}
