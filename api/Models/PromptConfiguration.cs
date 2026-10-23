//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class PromptConfiguration
{
    public long PromptConfigurationId { get; set; }

    public string AiModelIndCode { get; set; } = null!;

    public string AiModelName { get; set; } = null!;

    public long PromptId { get; set; }

    public string? ReasoningEffortIndCode { get; set; }

    public string? ReasoningEffort { get; set; }

    public int? MaxOutputTokens { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public bool CurrentPrompt { get; set; }

    public int PromptVersion { get; set; }

    public virtual ICollection<AiResponse> AiResponses { get; set; } = new List<AiResponse>();

    public virtual CodeValue CodeValue { get; set; } = null!;

    public virtual CodeValue? CodeValueNavigation { get; set; }

    public virtual ICollection<DocumentVisionExtraction> DocumentVisionExtractions { get; set; } = new List<DocumentVisionExtraction>();

    public virtual Prompt Prompt { get; set; } = null!;

    public virtual ICollection<PromptSuggestionResponse> PromptSuggestionResponses { get; set; } = new List<PromptSuggestionResponse>();
}
