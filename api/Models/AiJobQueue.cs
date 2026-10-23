//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class AiJobQueue
{
    public long JobId { get; set; }

    public long? AiResponseId { get; set; }

    public string JobTypeIndCode { get; set; } = null!;

    public string JobType { get; set; } = null!;

    public string Payload { get; set; } = null!;

    public string JobStatusIndCode { get; set; } = null!;

    public string JobStatus { get; set; } = null!;

    public int Attempts { get; set; }

    public int MaxAttempts { get; set; }

    public DateTime ScheduledAt { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public string? ErrorMessage { get; set; }

    public short JobPriority { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public long? PromptSuggestionResponseId { get; set; }

    public virtual AiResponse? AiResponse { get; set; }

    public virtual CodeValue CodeValue { get; set; } = null!;

    public virtual CodeValue CodeValueNavigation { get; set; } = null!;

    public virtual PromptSuggestionResponse? PromptSuggestionResponse { get; set; }
}
