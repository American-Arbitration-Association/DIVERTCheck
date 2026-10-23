//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record PromptConfigurationPageViewModel(
    long PromptConfigurationId,
    long PromptId,
    int PromptVersion,
    string AiModelName,
    string? ReasoningEffort,
    int? MaxOutputTokens,
    string EligibilityPrompt,
    string SummaryPrompt,
    IReadOnlyCollection<PromptOptionViewModel> AvailableModels,
    IReadOnlyCollection<PromptOptionViewModel> AvailableReasoningEfforts,
    IReadOnlyCollection<PromptVersionListItemViewModel> VersionHistory);
