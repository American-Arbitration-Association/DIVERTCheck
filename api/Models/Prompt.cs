//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class Prompt
{
    public long PromptId { get; set; }

    public string? MainPromptText { get; set; }

    public string? SummaryPromptText { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public string? PromptType { get; set; }

    public virtual ICollection<PromptConfiguration> PromptConfigurations { get; set; } = new List<PromptConfiguration>();
}
