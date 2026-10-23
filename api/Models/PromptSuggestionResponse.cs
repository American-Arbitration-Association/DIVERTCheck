//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class PromptSuggestionResponse
{
    public long PromptSuggestionResponseId { get; set; }

    public long PromptConfigurationId { get; set; }

    public string PromptType { get; set; } = null!;

    public string AiStatusIndCode { get; set; } = null!;

    public string AiStatus { get; set; } = null!;

    public string? GeneratedPrompt { get; set; }

    public string? RawResponse { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual ICollection<AiJobQueue> AiJobQueues { get; set; } = new List<AiJobQueue>();

    public virtual PromptConfiguration PromptConfiguration { get; set; } = null!;
}
