//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class AiResponse
{
    public long AiResponseId { get; set; }

    public long CaseId { get; set; }

    public string AiStatusIndCode { get; set; } = null!;

    public string AiStatus { get; set; } = null!;

    public string? AiFullResponse { get; set; }

    public string? AiSummaryResponse { get; set; }

    public long PromptConfigurationId { get; set; }

    public DateTime? CompletedAt { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public int ReviewVersion { get; set; }

    public virtual ICollection<AiJobQueue> AiJobQueues { get; set; } = new List<AiJobQueue>();

    public virtual ICollection<AiResponseDocument> AiResponseDocuments { get; set; } = new List<AiResponseDocument>();

    public virtual Case Case { get; set; } = null!;

    public virtual CodeValue CodeValue { get; set; } = null!;

    public virtual PromptConfiguration PromptConfiguration { get; set; } = null!;
}
