//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class CodeValue
{
    public long CodeValuesId { get; set; }

    public string CodeTypeCode { get; set; } = null!;

    public string Value { get; set; } = null!;

    public string ShortDescription { get; set; } = null!;

    public string? LongDescription { get; set; }

    public char? DefaultValueFlag { get; set; }

    public long? SortOrder { get; set; }

    public char? UserVisibleFlag { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual ICollection<AiJobQueue> AiJobQueueCodeValueNavigations { get; set; } = new List<AiJobQueue>();

    public virtual ICollection<AiJobQueue> AiJobQueueCodeValues { get; set; } = new List<AiJobQueue>();

    public virtual ICollection<AiResponse> AiResponses { get; set; } = new List<AiResponse>();

    public virtual ICollection<CaseDocument> CaseDocuments { get; set; } = new List<CaseDocument>();

    public virtual CodeType CodeTypeCodeNavigation { get; set; } = null!;

    public virtual ICollection<PromptConfiguration> PromptConfigurationCodeValueNavigations { get; set; } = new List<PromptConfiguration>();

    public virtual ICollection<PromptConfiguration> PromptConfigurationCodeValues { get; set; } = new List<PromptConfiguration>();

    public virtual ICollection<User> Users { get; set; } = new List<User>();
}
