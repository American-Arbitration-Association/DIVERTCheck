//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace api.Models;

public partial class DivertCheckDbContext : DbContext
{
    public static string DatabaseSchema { get; set; } = "your_db_schema";
    public DivertCheckDbContext(DbContextOptions<DivertCheckDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AiJobQueue> AiJobQueues { get; set; }

    public virtual DbSet<AiResponse> AiResponses { get; set; }

    public virtual DbSet<AiResponseDocument> AiResponseDocuments { get; set; }

    public virtual DbSet<Case> Cases { get; set; }

    public virtual DbSet<CaseDocument> CaseDocuments { get; set; }

    public virtual DbSet<CodeType> CodeTypes { get; set; }

    public virtual DbSet<CodeValue> CodeValues { get; set; }

    public virtual DbSet<DocumentVisionExtraction> DocumentVisionExtractions { get; set; }

    public virtual DbSet<Prompt> Prompts { get; set; }

    public virtual DbSet<PromptConfiguration> PromptConfigurations { get; set; }

    public virtual DbSet<PromptSuggestionResponse> PromptSuggestionResponses { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("citext");
        var schema = DatabaseSchema?.Trim();

        if (!string.IsNullOrWhiteSpace(schema))
        {
            modelBuilder.HasDefaultSchema(schema);
        }

        modelBuilder.Entity<AiJobQueue>(entity =>
        {
            entity.HasKey(e => e.JobId).HasName("aijobqueue_pkey");

            entity.ToTable("ai_job_queue");

            entity.HasIndex(e => e.PromptSuggestionResponseId, "idx_ai_job_queue_prompt_suggestion_response_id");

            entity.HasIndex(e => e.AiResponseId, "idx_aijobqueue_airesponseid");

            entity.HasIndex(e => new { e.ScheduledAt, e.JobPriority }, "idx_aijobqueue_queued_only").HasFilter("(((job_status)::text = 'QUEUED'::text) AND (is_record_active = true))");

            entity.HasIndex(e => new { e.JobStatus, e.JobType, e.ScheduledAt }, "idx_aijobqueue_status_type_sched");

            entity.Property(e => e.JobId)
                .UseIdentityAlwaysColumn()
                .HasColumnName("job_id");
            entity.Property(e => e.AiResponseId).HasColumnName("ai_response_id");
            entity.Property(e => e.Attempts)
                .HasDefaultValue(0)
                .HasColumnName("attempts");
            entity.Property(e => e.CompletedAt).HasColumnName("completed_at");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.ErrorMessage)
                .HasMaxLength(500)
                .HasColumnName("error_message");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.JobPriority)
                .HasDefaultValue((short)5)
                .HasColumnName("job_priority");
            entity.Property(e => e.JobStatus)
                .HasMaxLength(100)
                .HasDefaultValueSql("'QUEUED'::character varying")
                .HasColumnName("job_status");
            entity.Property(e => e.JobStatusIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'JOB_STATUS'::character varying")
                .HasColumnName("job_status_ind_code");
            entity.Property(e => e.JobType)
                .HasMaxLength(100)
                .HasColumnName("job_type");
            entity.Property(e => e.JobTypeIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'JOB_TYPE'::character varying")
                .HasColumnName("job_type_ind_code");
            entity.Property(e => e.MaxAttempts)
                .HasDefaultValue(3)
                .HasColumnName("max_attempts");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.Payload)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("payload");
            entity.Property(e => e.PromptSuggestionResponseId).HasColumnName("prompt_suggestion_response_id");
            entity.Property(e => e.ScheduledAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("scheduled_at");
            entity.Property(e => e.StartedAt).HasColumnName("started_at");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.AiResponse).WithMany(p => p.AiJobQueues)
                .HasForeignKey(d => d.AiResponseId)
                .HasConstraintName("fk_aijobqueue_airesponse");

            entity.HasOne(d => d.PromptSuggestionResponse).WithMany(p => p.AiJobQueues)
                .HasForeignKey(d => d.PromptSuggestionResponseId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_ai_job_queue_prompt_suggestion_response");

            entity.HasOne(d => d.CodeValue).WithMany(p => p.AiJobQueueCodeValues)
                .HasForeignKey(d => new { d.JobStatusIndCode, d.JobStatus })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_aijobqueue_job_status");

            entity.HasOne(d => d.CodeValueNavigation).WithMany(p => p.AiJobQueueCodeValueNavigations)
                .HasForeignKey(d => new { d.JobTypeIndCode, d.JobType })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_aijobqueue_job_type");
        });

        modelBuilder.Entity<AiResponse>(entity =>
        {
            entity.HasKey(e => e.AiResponseId).HasName("airesponse_pkey");

            entity.ToTable("ai_response");

            entity.HasIndex(e => e.CaseId, "idx_airesponse_caseid");

            entity.HasIndex(e => new { e.CaseId, e.CreatedDttm }, "idx_airesponse_caseid_createddttm").IsDescending(false, true);

            entity.HasIndex(e => e.PromptConfigurationId, "idx_airesponse_promptconfigurationid");

            entity.HasIndex(e => new { e.CaseId, e.ReviewVersion }, "ux_ai_response_case_review_version_completed")
                .IsUnique()
                .HasFilter("((is_record_active = true) AND ((ai_status)::text = 'COMPLETED'::text) AND (review_version > 0))");

            entity.Property(e => e.AiResponseId).HasColumnName("ai_response_id");
            entity.Property(e => e.AiFullResponse).HasColumnName("ai_full_response");
            entity.Property(e => e.AiStatus)
                .HasMaxLength(100)
                .HasColumnName("ai_status");
            entity.Property(e => e.AiStatusIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'AI_RESPONSE_STATUS'::character varying")
                .HasColumnName("ai_status_ind_code");
            entity.Property(e => e.AiSummaryResponse).HasColumnName("ai_summary_response");
            entity.Property(e => e.CaseId).HasColumnName("case_id");
            entity.Property(e => e.CompletedAt).HasColumnName("completed_at");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PromptConfigurationId).HasColumnName("prompt_configuration_id");
            entity.Property(e => e.ReviewVersion)
                .HasDefaultValue(0)
                .HasColumnName("review_version");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.Case).WithMany(p => p.AiResponses)
                .HasForeignKey(d => d.CaseId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_airesponse_cases");

            entity.HasOne(d => d.PromptConfiguration).WithMany(p => p.AiResponses)
                .HasForeignKey(d => d.PromptConfigurationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_airesponse_promptconfiguration");

            entity.HasOne(d => d.CodeValue).WithMany(p => p.AiResponses)
                .HasForeignKey(d => new { d.AiStatusIndCode, d.AiStatus })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_airesponse_status");
        });

        modelBuilder.Entity<AiResponseDocument>(entity =>
        {
            entity.HasKey(e => e.AiResponseDocumentId).HasName("airesponsedocument_pkey");

            entity.ToTable("ai_response_document");

            entity.HasIndex(e => e.AiResponseId, "idx_airesponsedocument_airesponseid");

            entity.HasIndex(e => e.DocumentId, "idx_airesponsedocument_documentid");

            entity.HasIndex(e => new { e.DocumentId, e.AiResponseId }, "uq_airesponsedocument").IsUnique();

            entity.Property(e => e.AiResponseDocumentId).HasColumnName("ai_response_document_id");
            entity.Property(e => e.AiResponseId).HasColumnName("ai_response_id");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.DocumentId).HasColumnName("document_id");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.AiResponse).WithMany(p => p.AiResponseDocuments)
                .HasForeignKey(d => d.AiResponseId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_airesponsedocument_airesponse");

            entity.HasOne(d => d.Document).WithMany(p => p.AiResponseDocuments)
                .HasForeignKey(d => d.DocumentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_airesponsedocument_casedocuments");
        });

        modelBuilder.Entity<Case>(entity =>
        {
            entity.HasKey(e => e.CaseId).HasName("cases_pkey");

            entity.ToTable("cases");

            entity.HasIndex(e => e.CaseNumber, "uq_cases_case_number").IsUnique();

            entity.Property(e => e.CaseId).HasColumnName("case_id");
            entity.Property(e => e.CaseName)
                .HasMaxLength(255)
                .HasColumnName("case_name");
            entity.Property(e => e.CaseNumber)
                .HasMaxLength(100)
                .HasColumnName("case_number");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.FilingDate).HasColumnName("filing_date");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");
        });

        modelBuilder.Entity<CaseDocument>(entity =>
        {
            entity.HasKey(e => e.DocumentId).HasName("casedocuments_pkey");

            entity.ToTable("case_documents");

            entity.HasIndex(e => e.CaseId, "idx_casedocuments_caseid");

            entity.HasIndex(e => new { e.CaseId, e.UploadedAt }, "idx_casedocuments_caseid_uploadedat").IsDescending(false, true);

            entity.HasIndex(e => new { e.SubmittedByIndCode, e.SubmittedBy }, "idx_casedocuments_submitted_by");

            entity.HasIndex(e => e.AzureStorageId, "uq_casedocuments_azure_storage_id").IsUnique();

            entity.Property(e => e.DocumentId).HasColumnName("document_id");
            entity.Property(e => e.AzureStorageId)
                .HasMaxLength(255)
                .HasColumnName("azure_storage_id");
            entity.Property(e => e.CaseId).HasColumnName("case_id");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.DocumentName)
                .HasMaxLength(255)
                .HasColumnName("document_name");
            entity.Property(e => e.FileSize).HasColumnName("file_size");
            entity.Property(e => e.IsFinancialDocument)
                .HasDefaultValue(false)
                .HasColumnName("is_financial_document");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.SubmittedBy)
                .HasMaxLength(100)
                .HasColumnName("submitted_by");
            entity.Property(e => e.SubmittedByIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'DOCUMENT_SUBMITTED_BY'::character varying")
                .HasColumnName("submitted_by_ind_code");
            entity.Property(e => e.UploadedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnName("uploaded_at");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.Case).WithMany(p => p.CaseDocuments)
                .HasForeignKey(d => d.CaseId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_casedocuments_cases");

            entity.HasOne(d => d.CodeValue).WithMany(p => p.CaseDocuments)
                .HasForeignKey(d => new { d.SubmittedByIndCode, d.SubmittedBy })
                .HasConstraintName("fk_casedocuments_submitted_by");
        });

        modelBuilder.Entity<CodeType>(entity =>
        {
            entity.HasKey(e => e.CodeTypeCode).HasName("code_types_pkey");

            entity.ToTable("code_types");

            entity.Property(e => e.CodeTypeCode)
                .HasMaxLength(100)
                .HasColumnName("code_type_code");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.Label)
                .HasMaxLength(100)
                .HasColumnName("label");
            entity.Property(e => e.LongDescription)
                .HasMaxLength(256)
                .HasColumnName("long_description");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.ShortDescription)
                .HasMaxLength(100)
                .HasColumnName("short_description");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");
        });

        modelBuilder.Entity<CodeValue>(entity =>
        {
            entity.HasKey(e => new { e.CodeTypeCode, e.Value }).HasName("code_values_pk");

            entity.ToTable("code_values");

            entity.Property(e => e.CodeTypeCode)
                .HasMaxLength(100)
                .HasColumnName("code_type_code");
            entity.Property(e => e.Value)
                .HasMaxLength(100)
                .HasColumnName("value");
            entity.Property(e => e.CodeValuesId)
                .ValueGeneratedOnAdd()
                .HasColumnName("code_values_id");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.DefaultValueFlag)
                .HasMaxLength(1)
                .HasDefaultValueSql("'N'::bpchar")
                .HasColumnName("default_value_flag");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.LongDescription)
                .HasMaxLength(256)
                .HasColumnName("long_description");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.ShortDescription)
                .HasMaxLength(100)
                .HasColumnName("short_description");
            entity.Property(e => e.SortOrder).HasColumnName("sort_order");
            entity.Property(e => e.UserVisibleFlag)
                .HasMaxLength(1)
                .HasDefaultValueSql("'Y'::bpchar")
                .HasColumnName("user_visible_flag");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.CodeTypeCodeNavigation).WithMany(p => p.CodeValues)
                .HasForeignKey(d => d.CodeTypeCode)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_code_values_code_type");
        });

        modelBuilder.Entity<DocumentVisionExtraction>(entity =>
        {
            entity.HasKey(e => e.DocumentVisionExtractionId).HasName("documentvisionextractions_pkey");

            entity.ToTable("document_vision_extractions");

            entity.HasIndex(e => e.DocumentHash, "idx_documentvisionextractions_documenthash");

            entity.HasIndex(e => e.PromptConfigurationId, "idx_documentvisionextractions_promptconfigurationid");

            entity.HasIndex(e => new { e.DocumentId, e.PromptConfigurationId }, "uq_documentvisionextractions_document_prompt").IsUnique();

            entity.Property(e => e.DocumentVisionExtractionId).HasColumnName("document_vision_extraction_id");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.DocumentHash)
                .HasMaxLength(64)
                .IsFixedLength()
                .HasColumnName("document_hash");
            entity.Property(e => e.DocumentId).HasColumnName("document_id");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PromptConfigurationId).HasColumnName("prompt_configuration_id");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");
            entity.Property(e => e.VisionExtractedAzureDocumentId).HasColumnName("vision_extracted_azure_document_id");

            entity.HasOne(d => d.Document).WithMany(p => p.DocumentVisionExtractions)
                .HasForeignKey(d => d.DocumentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_documentvisionextractions_document");

            entity.HasOne(d => d.PromptConfiguration).WithMany(p => p.DocumentVisionExtractions)
                .HasForeignKey(d => d.PromptConfigurationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_documentvisionextractions_promptconfiguration");
        });

        modelBuilder.Entity<Prompt>(entity =>
        {
            entity.HasKey(e => e.PromptId).HasName("prompts_pkey");

            entity.ToTable("prompts");

            entity.Property(e => e.PromptId).HasColumnName("prompt_id");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.MainPromptText).HasColumnName("main_prompt_text");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PromptType)
                .HasMaxLength(100)
                .HasColumnName("prompt_type");
            entity.Property(e => e.SummaryPromptText).HasColumnName("summary_prompt_text");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");
        });

        modelBuilder.Entity<PromptConfiguration>(entity =>
        {
            entity.HasKey(e => e.PromptConfigurationId).HasName("promptconfiguration_pkey");

            entity.ToTable("prompt_configuration");

            entity.HasIndex(e => e.PromptId, "idx_promptconfiguration_promptid");

            entity.HasIndex(e => e.CurrentPrompt, "uq_prompt_configuration_one_current_active")
                .IsUnique()
                .HasFilter("((current_prompt = true) AND (is_record_active = true))");

            entity.Property(e => e.PromptConfigurationId).HasColumnName("prompt_configuration_id");
            entity.Property(e => e.AiModelIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'AI_MODEL'::character varying")
                .HasColumnName("ai_model_ind_code");
            entity.Property(e => e.AiModelName)
                .HasMaxLength(100)
                .HasColumnName("ai_model_name");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.CurrentPrompt)
                .HasDefaultValue(false)
                .HasColumnName("current_prompt");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.MaxOutputTokens).HasColumnName("max_output_tokens");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PromptId).HasColumnName("prompt_id");
            entity.Property(e => e.PromptVersion).HasColumnName("prompt_version");
            entity.Property(e => e.ReasoningEffort)
                .HasMaxLength(100)
                .HasColumnName("reasoning_effort");
            entity.Property(e => e.ReasoningEffortIndCode)
                .HasMaxLength(100)
                .HasColumnName("reasoning_effort_ind_code");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.Prompt).WithMany(p => p.PromptConfigurations)
                .HasForeignKey(d => d.PromptId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_promptconfiguration_prompts");

            entity.HasOne(d => d.CodeValue).WithMany(p => p.PromptConfigurationCodeValues)
                .HasForeignKey(d => new { d.AiModelIndCode, d.AiModelName })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_promptconfiguration_model");

            entity.HasOne(d => d.CodeValueNavigation).WithMany(p => p.PromptConfigurationCodeValueNavigations)
                .HasForeignKey(d => new { d.ReasoningEffortIndCode, d.ReasoningEffort })
                .HasConstraintName("fk_promptconfiguration_reasoning");
        });

        modelBuilder.Entity<PromptSuggestionResponse>(entity =>
        {
            entity.HasKey(e => e.PromptSuggestionResponseId).HasName("prompt_suggestion_response_pkey");

            entity.ToTable("prompt_suggestion_response");

            entity.HasIndex(e => e.PromptConfigurationId, "idx_prompt_suggestion_response_prompt_configuration_id");

            entity.HasIndex(e => new { e.AiStatusIndCode, e.AiStatus }, "idx_prompt_suggestion_response_status");

            entity.Property(e => e.PromptSuggestionResponseId)
                .UseIdentityAlwaysColumn()
                .HasColumnName("prompt_suggestion_response_id");
            entity.Property(e => e.AiStatus)
                .HasMaxLength(100)
                .HasDefaultValueSql("'COMPLETED'::character varying")
                .HasColumnName("ai_status");
            entity.Property(e => e.AiStatusIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'AI_RESPONSE_STATUS'::character varying")
                .HasColumnName("ai_status_ind_code");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.GeneratedPrompt).HasColumnName("generated_prompt");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PromptConfigurationId).HasColumnName("prompt_configuration_id");
            entity.Property(e => e.PromptType)
                .HasMaxLength(100)
                .HasColumnName("prompt_type");
            entity.Property(e => e.RawResponse)
                .HasColumnType("jsonb")
                .HasColumnName("raw_response");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.PromptConfiguration).WithMany(p => p.PromptSuggestionResponses)
                .HasForeignKey(d => d.PromptConfigurationId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("fk_prompt_suggestion_response_prompt_configuration");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("user_pkey");

            entity.ToTable("user");

            entity.HasIndex(e => e.Email, "uq_user_email").IsUnique();

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.AccountLockedUntilDttm)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("account_locked_until_dttm");
            entity.Property(e => e.CreatedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_dttm");
            entity.Property(e => e.CreatedUser)
                .HasDefaultValue(0L)
                .HasColumnName("created_user");
            entity.Property(e => e.Email)
                .HasMaxLength(255)
                .HasColumnName("email");
            entity.Property(e => e.FailedLoginAttempts)
                .HasDefaultValue(0)
                .HasColumnName("failed_login_attempts");
            entity.Property(e => e.IsAccountLocked)
                .HasDefaultValue(false)
                .HasColumnName("is_account_locked");
            entity.Property(e => e.IsRecordActive)
                .HasDefaultValue(true)
                .HasColumnName("is_record_active");
            entity.Property(e => e.LastLoginDttm)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("last_login_dttm");
            entity.Property(e => e.ModifiedDttm)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("modified_dttm");
            entity.Property(e => e.ModifiedUser)
                .HasDefaultValue(0L)
                .HasColumnName("modified_user");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.RoleCode)
                .HasMaxLength(100)
                .HasColumnName("role_code");
            entity.Property(e => e.RoleIndCode)
                .HasMaxLength(100)
                .HasDefaultValueSql("'USER_ROLE'::character varying")
                .HasColumnName("role_ind_code");
            entity.Property(e => e.VersionId)
                .HasDefaultValue(1)
                .HasColumnName("version_id");

            entity.HasOne(d => d.CodeValue).WithMany(p => p.Users)
                .HasForeignKey(d => new { d.RoleIndCode, d.RoleCode })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_user_role_code_values");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
