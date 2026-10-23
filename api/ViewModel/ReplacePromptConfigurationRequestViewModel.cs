//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Text.Json.Serialization;

namespace api.ViewModels;

public sealed class ReplacePromptConfigurationRequestViewModel
{
    public string AiModelName { get; init; } = null!;

    public string? ReasoningEffort { get; init; }

    [JsonPropertyName("reasoning")]
    public string? Reasoning { get; init; }

    [JsonPropertyName("reasoning_effort")]
    public string? ReasoningEffortSnakeCase { get; init; }

    public string EligibilityPrompt { get; init; } = null!;

    public string SummaryPrompt { get; init; } = null!;

    public int? MaxOutputTokens { get; init; }
}
