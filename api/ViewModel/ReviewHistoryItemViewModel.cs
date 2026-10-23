//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record ReviewHistoryItemViewModel(
    long AiResponseId,
    long CaseId,
    int ReviewVersion,
    DateTime ReviewDate,
    string AiStatus,
    long PromptConfigurationId,
    int PromptVersion,
    string AiModelName,
    string? ReasoningEffort,
    bool IsCurrent);
