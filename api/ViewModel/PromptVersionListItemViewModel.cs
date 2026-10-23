//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record PromptVersionListItemViewModel(
    long PromptConfigurationId,
    long PromptId,
    int PromptVersion,
    string DisplayLabel,
    DateTime ModifiedAtUtc,
    bool IsCurrent);
