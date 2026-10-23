//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

public class AiJobService : IAiJobService
{
    private const string LegacyTestOutputPrefix = "TEST OUTPUT:";

    private const string EligibilityPromptType = "Eligibility";

    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ProcessingLeaseHeartbeatInterval = TimeSpan.FromMinutes(1);
    private static readonly JsonSerializerOptions ApiJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly DivertCheckDbContext _db;
    private readonly IBlobStorageService _blobStorageService;
    private readonly IAiExecutionService _aiExecutionService;
    private readonly IAiCancellationService _aiCancellationService;
    private readonly IPromptConfigurationService _promptConfigurationService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AiJobService> _logger;
    private readonly int _testProcessingDelaySeconds;
    private readonly TimeSpan _maximumProcessingDuration;
    private readonly string _azureStorageContainerName;
    private readonly IUserAuditService _userAuditService;

    public AiJobService(
        DivertCheckDbContext db,
        IConfiguration configuration,
        IBlobStorageService blobStorageService,
        IAiExecutionService aiExecutionService,
        IAiCancellationService aiCancellationService,
        IPromptConfigurationService promptConfigurationService,
        IServiceScopeFactory scopeFactory,
        ILogger<AiJobService> logger,
        IUserAuditService userAuditService)
    {
        _db = db;
        _blobStorageService = blobStorageService;
        _aiExecutionService = aiExecutionService;
        _aiCancellationService = aiCancellationService;
        _promptConfigurationService = promptConfigurationService;
        _scopeFactory = scopeFactory;
        _logger = logger;
        _userAuditService = userAuditService;
        _testProcessingDelaySeconds = configuration.GetValue<int?>("AiJobProcessing:TestDelaySeconds") ?? 5;
        _maximumProcessingDuration = TimeSpan.FromSeconds(Math.Max(
            1,
            configuration.GetValue<int?>("AiJobProcessing:JobTimeoutSeconds") ?? 900));
        _azureStorageContainerName = configuration["AzureStorage:ContainerName"] ?? "your_container_name";
    }

    /*
       Queues a case review request by creating the AI response first,
       attaching the chosen documents, and then inserting the worker job.
    */
    public async Task<QueueAiJobResponseViewModel> QueueCaseJobAsync(
        long caseId,
        QueueAiJobRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        ValidateQueueRequest(request);
        await EnsureCaseExistsAsync(caseId, cancellationToken);

        var queueContext = await BuildQueueContextAsync(caseId, request, cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        var aiResponse = CreateQueuedAiResponse(caseId, queueContext);
        _db.AiResponses.Add(aiResponse);
        await _userAuditService.SaveChangesAsync(cancellationToken);

        _db.AiResponseDocuments.AddRange(CreateResponseDocuments(aiResponse.AiResponseId, queueContext.Documents));
        var job = CreateQueuedJob(aiResponse.AiResponseId, caseId, request, queueContext);
        _db.AiJobQueues.Add(job);
        await _userAuditService.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new QueueAiJobResponseViewModel(
            job.JobId,
            aiResponse.AiResponseId,
            aiResponse.AiStatus,
            job.JobStatus,
            caseId,
            queueContext.Documents.Select(document => document.DocumentId).ToArray(),
            job.ScheduledAt
        );
    }

    public async Task<AiJobStatusViewModel> QueueSuggestedPromptJobAsync(
        GeneratePromptReviewRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var codeValues = await AiJobCodeValues.LoadAsync(_db, cancellationToken);
        var queuedStatus = codeValues.QueuedJobStatus;
        var jobType = codeValues.SuggestedPromptJobType;
        var payload = await CreateSuggestedPromptJobPayloadAsync(
            PromptConfigurationService.NormalizePromptType(request.PromptType),
            request.File,
            cancellationToken);

        var job = new AiJobQueue
        {
            JobTypeIndCode = jobType.CodeTypeCode,
            JobType = jobType.Value,
            Payload = JsonSerializer.Serialize(payload),
            JobStatusIndCode = queuedStatus.CodeTypeCode,
            JobStatus = queuedStatus.Value,
            Attempts = 0,
            MaxAttempts = 3,
            ScheduledAt = DateTime.UtcNow,
            JobPriority = 5,
            IsRecordActive = true
        };

        _db.AiJobQueues.Add(job);
        await _userAuditService.SaveChangesAsync(cancellationToken);

        return await MapJobStatusAsync(job, cancellationToken);
    }

    public async Task<AiJobStatusViewModel> GetJobStatusAsync(
        long jobId,
        CancellationToken cancellationToken = default)
    {
        if (jobId <= 0)
            throw new ArgumentException("A valid job id is required.", nameof(jobId));

        var job = await _db.AiJobQueues
            .AsNoTracking()
            .Include(queueItem => queueItem.AiResponse)
            .FirstOrDefaultAsync(
                queueItem => queueItem.JobId == jobId && queueItem.IsRecordActive,
                cancellationToken)
            ?? throw new KeyNotFoundException($"AI job {jobId} was not found.");

        return await MapJobStatusAsync(job, cancellationToken);
    }

    /*
       Returns the next batch of jobs the background worker is allowed to claim,
       including retried work whose scheduled retry time has arrived.
    */
    public async Task<IReadOnlyCollection<long>> GetQueuedJobIdsAsync(
        int batchSize,
        CancellationToken cancellationToken = default)
    {
        var effectiveBatchSize = Math.Max(1, batchSize);
        var timestampNow = DateTime.UtcNow;
        var codeValues = await AiJobCodeValues.LoadAsync(_db, cancellationToken);

        return await _db.AiJobQueues
            .Where(job =>
                job.IsRecordActive &&
                codeValues.RunnableJobStatusValues.Contains(job.JobStatus) &&
                job.ScheduledAt <= timestampNow &&
                job.Attempts < job.MaxAttempts)
            .OrderBy(job => job.JobPriority)
            .ThenBy(job => job.ScheduledAt)
            .Select(job => job.JobId)
            .Take(effectiveBatchSize)
            .ToListAsync(cancellationToken);
    }

    /* Reclaims jobs left in PROCESSING by a stopped or failed worker. */
    public async Task<int> RequeueStalledProcessingJobsAsync(
        TimeSpan staleAfter,
        CancellationToken cancellationToken = default)
    {
        var effectiveStaleAfter = staleAfter > TimeSpan.Zero
            ? staleAfter
            : TimeSpan.FromMinutes(10);
        var timestampNow = DateTime.UtcNow;
        var staleBefore = timestampNow.Subtract(effectiveStaleAfter);
        var codeValues = await AiJobCodeValues.LoadAsync(_db, cancellationToken);
        var stalledJobs = await _db.AiJobQueues
            .Include(job => job.AiResponse)
            .Where(job =>
                job.IsRecordActive &&
                job.JobStatus == codeValues.ProcessingJobStatus.Value &&
                job.StartedAt != null &&
                job.StartedAt <= staleBefore)
            .ToListAsync(cancellationToken);

        foreach (var job in stalledJobs)
        {
            job.JobStatusIndCode = codeValues.RetryJobStatus.CodeTypeCode;
            job.JobStatus = codeValues.RetryJobStatus.Value;
            job.ScheduledAt = timestampNow;
            job.StartedAt = null;
            job.CompletedAt = null;
            job.ErrorMessage = $"Requeued after exceeding the {effectiveStaleAfter.TotalSeconds:0}-second processing lease.";

            if (job.AiResponse is not null)
            {
                job.AiResponse.AiStatusIndCode = codeValues.QueuedAiResponseStatus.CodeTypeCode;
                job.AiResponse.AiStatus = codeValues.QueuedAiResponseStatus.Value;
                job.AiResponse.CompletedAt = null;
            }

            /* Stalled jobs in one batch can belong to different users, so each one is
               saved under its own queueing user. Rows saved by an earlier iteration are
               Unchanged by now, so a save only carries the job it is attributed to. */
            using var actingUser = _userAuditService.ActAs(job.CreatedUser);
            await _userAuditService.SaveChangesAsync(cancellationToken);
        }

        if (stalledJobs.Count > 0)
        {
            _logger.LogWarning(
                "Requeued {JobCount} stalled AI job(s) after the {StaleAfter} processing lease elapsed.",
                stalledJobs.Count,
                effectiveStaleAfter);
        }

        return stalledJobs.Count;
    }

    /*
       Claims exactly one job, executes it, and records either completion
       or retry/failure state so parallel workers do not process it twice.
    */
    public async Task ProcessJobAsync(
        long jobId,
        CancellationToken cancellationToken = default)
    {
        /* The worker runs outside a request, so attribute every write for this job
           to the user that queued it instead of letting it fall back to the system
           user. The scope covers the claim, the lease heartbeat, and the completion
           and failure paths below. */
        var queueingUserId = await GetQueueingUserIdAsync(jobId, cancellationToken);
        using var actingUser = _userAuditService.ActAs(queueingUserId);

        // Pull the canonical queue status values from code_values before attempting a claim.
        var processingCodes = await AiJobCodeValues.LoadAsync(_db, cancellationToken);
        var wasClaimed = await TryClaimJobAsync(
            jobId,
            DateTime.UtcNow,
            processingCodes,
            cancellationToken);

        if (!wasClaimed)
            return;

        var job = await LoadJobForProcessingAsync(jobId, cancellationToken);

        using var executionCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        executionCancellation.CancelAfter(_maximumProcessingDuration);
        using var leaseHeartbeatCancellation = CancellationTokenSource.CreateLinkedTokenSource(executionCancellation.Token);
        var leaseHeartbeat = KeepJobLeaseAliveAsync(
            jobId,
            processingCodes.ProcessingJobStatus.Value,
            leaseHeartbeatCancellation.Token);

        try
        {
            await ProcessClaimedJobAsync(job, processingCodes, executionCancellation.Token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException) when (executionCancellation.IsCancellationRequested)
        {
            await HandleJobFailureAsync(
                job,
                processingCodes,
                new TimeoutException($"AI job {jobId} exceeded the {_maximumProcessingDuration.TotalSeconds:0}-second execution limit."),
                CancellationToken.None);
        }
        catch (OperationCanceledException exception)
        {
            await HandleJobCancellationAsync(job, processingCodes, exception);
        }
        catch (Exception exception)
        {
            await HandleJobFailureAsync(job, processingCodes, exception, cancellationToken);
        }
        finally
        {
            await leaseHeartbeatCancellation.CancelAsync();
            await leaseHeartbeat;
        }
    }

    public async Task<CancelAiJobResponseViewModel> CancelJobAsync(
        long jobId,
        CancellationToken cancellationToken = default)
    {
        ValidateCancelJobRequest(jobId);
        var job = await GetCancelableJobAsync(jobId, cancellationToken);
        var codeValues = await AiJobCodeValues.LoadAsync(_db, cancellationToken);

        if (IsStatus(job, codeValues.CompletedJobStatus.Value))
            throw new InvalidOperationException("This job has already completed and cannot be canceled.");

        if (IsStatus(job, codeValues.ProcessingJobStatus.Value))
        {
            _aiCancellationService.RequestOperationCancellation(BuildAiJobOperationKey(jobId));

            return BuildCancelResponse();
        }

        if (!codeValues.RunnableJobStatusValues.Contains(job.JobStatus, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException($"This job is in status '{job.JobStatus}' and cannot be canceled.");

        await MarkJobCanceledAsync(job, codeValues, cancellationToken);
        await DeleteUploadedDocumentsForCanceledJobAsync(job, cancellationToken);

        return BuildCancelResponse();
    }

    /*
       Streams the queued case documents into the AI client, using the active
       prompt configuration and returning both full and summary outputs.
    */
    private async Task<AiExecutionResult> ExecuteJobAsync(
        AiJobQueue job,
        AiResponse aiResponse,
        IReadOnlyCollection<CaseDocument> documents,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Starting AI job {JobId} for case {CaseId}. Documents: {Documents}",
            job.JobId,
            aiResponse.CaseId,
            string.Join(", ", documents.Select(document => $"{document.DocumentId}:{document.DocumentName}")));

        if (_testProcessingDelaySeconds > 0)
        {
            await Task.Delay(TimeSpan.FromSeconds(_testProcessingDelaySeconds), cancellationToken);
        }

        var promptConfiguration = aiResponse.PromptConfiguration;
        if (promptConfiguration?.Prompt == null)
        {
            throw new InvalidOperationException(
                $"Prompt configuration {aiResponse.PromptConfigurationId} was not loaded for AI job {job.JobId}.");
        }

        // Materialize the case documents from blob storage so the execution service can send them to OpenAI.
        var documentContents = await LoadDocumentContentsAsync(documents, cancellationToken);
        var result = await _aiExecutionService.ExecuteCaseReviewAsync(
            promptConfiguration,
            documentContents,
            job.JobId,
            cancellationToken);

        _logger.LogInformation(
            "Completed AI job {JobId} for case {CaseId} using {DocumentCount} document(s).",
            job.JobId,
            aiResponse.CaseId,
            documents.Count);

        return result;
    }

    /*
       Applies retry scheduling or terminal failure state after an exception
       and keeps the response record aligned with the queue record.
    */
    private async Task HandleJobFailureAsync(
        AiJobQueue job,
        AiJobCodeValues codeValues,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var timestampNow = DateTime.UtcNow;
        // Keep retry logic in one place so queue state and AI response state stay synchronized.
        // Content-driven failures repeat identically on every attempt, so fail them now.
        var isDeterministicFailure = OpenAiExecutionService.IsDeterministicFailureMessage(exception.Message);
        var willRetry = job.Attempts < job.MaxAttempts && !isDeterministicFailure;
        var nextJobStatus = willRetry
            ? codeValues.RetryJobStatus
            : codeValues.FailedJobStatus;
        var failureMessage = exception.Message[..Math.Min(exception.Message.Length, 500)];

        job.JobStatusIndCode = nextJobStatus.CodeTypeCode;
        job.JobStatus = nextJobStatus.Value;
        job.ScheduledAt = willRetry ? timestampNow.Add(RetryDelay) : job.ScheduledAt;
        job.CompletedAt = willRetry ? null : timestampNow;
        job.ErrorMessage = failureMessage;
        job.Payload = UpdateJobPayloadLastFailureMessage(job.Payload, failureMessage);

        if (job.AiResponse is not null)
        {
            var nextAiResponseStatus = codeValues.FailedAiResponseStatus;
            job.AiResponse.AiStatusIndCode = nextAiResponseStatus.CodeTypeCode;
            job.AiResponse.AiStatus = nextAiResponseStatus.Value;
            job.AiResponse.CompletedAt = willRetry ? null : timestampNow;
        }

        await _userAuditService.SaveChangesAsync(cancellationToken);

        if (!willRetry)
            await _aiExecutionService.DiscardRetryStateAsync(job.JobId, CancellationToken.None);

        _logger.LogError(
            exception,
            "AI job {JobId} failed on attempt {Attempt} of {MaxAttempts}. Retry scheduled: {RetryScheduled}.",
            job.JobId,
            job.Attempts,
            job.MaxAttempts,
            willRetry);
    }

    private async Task HandleJobCancellationAsync(
        AiJobQueue job,
        AiJobCodeValues codeValues,
        OperationCanceledException exception)
    {
        await MarkJobCanceledAsync(job, codeValues, CancellationToken.None);
        await DeleteUploadedDocumentsForCanceledJobAsync(job, CancellationToken.None);

        _logger.LogInformation(
            exception,
            "AI job {JobId} was canceled before a response was completed.",
            job.JobId);
    }

    private async Task MarkJobCanceledAsync(
        AiJobQueue job,
        AiJobCodeValues codeValues,
        CancellationToken cancellationToken)
    {
        var timestampNow = DateTime.UtcNow;
        var canceledJobStatus = codeValues.CancellationStatus(job.JobStatusIndCode);

        job.JobStatusIndCode = canceledJobStatus.CodeTypeCode;
        job.JobStatus = canceledJobStatus.Value;
        job.CompletedAt = timestampNow;
        job.ErrorMessage = "Canceled by user request.";

        if (job.AiResponse is not null)
        {
            var canceledAiResponseStatus = codeValues.CancellationStatus(job.AiResponse.AiStatusIndCode);
            job.AiResponse.AiStatusIndCode = canceledAiResponseStatus.CodeTypeCode;
            job.AiResponse.AiStatus = canceledAiResponseStatus.Value;
            job.AiResponse.AiFullResponse = null;
            job.AiResponse.AiSummaryResponse = null;
            job.AiResponse.CompletedAt = timestampNow;
        }

        await _userAuditService.SaveChangesAsync(cancellationToken);
    }

    private async Task<AiJobQueue> GetCancelableJobAsync(
        long jobId,
        CancellationToken cancellationToken)
    {
        return await _db.AiJobQueues
            .Include(job => job.AiResponse)
            .FirstOrDefaultAsync(
                job =>
                    job.JobId == jobId &&
                    job.IsRecordActive,
                cancellationToken)
            ?? throw new KeyNotFoundException("This job was not found.");
    }

    private static void ValidateCancelJobRequest(long jobId)
    {
        if (jobId <= 0)
            throw new ArgumentException("A valid job id is required.", nameof(jobId));
    }

    private static CancelAiJobResponseViewModel BuildCancelResponse() =>
        new("Cancellation was successful.", true);

    private static bool IsStatus(AiJobQueue job, string status) =>
        string.Equals(job.JobStatus, status, StringComparison.OrdinalIgnoreCase);

    private async Task EnsureCaseExistsAsync(long caseId, CancellationToken cancellationToken)
    {
        var caseExists = await _db.Cases
            .AnyAsync(caseItem => caseItem.IsRecordActive && caseItem.CaseId == caseId, cancellationToken);

        if (!caseExists)
            throw new KeyNotFoundException($"Case {caseId} was not found.");
    }

    private async Task<long> ResolvePromptConfigurationIdAsync(
        QueueAiJobRequestViewModel request,
        CancellationToken cancellationToken)
    {
        var editablePromptConfigurations = _db.PromptConfigurations
            .Where(configuration =>
                configuration.IsRecordActive &&
                configuration.Prompt.IsRecordActive &&
                configuration.Prompt.PromptType == EligibilityPromptType &&
                configuration.Prompt.MainPromptText != null &&
                configuration.Prompt.MainPromptText != "" &&
                configuration.Prompt.SummaryPromptText != null &&
                configuration.Prompt.SummaryPromptText != "");

        if (request.PromptConfigurationId is { } requestedPromptConfigurationId)
        {
            var requestedConfigurationExists = await editablePromptConfigurations
                .AnyAsync(
                    configuration => configuration.PromptConfigurationId == requestedPromptConfigurationId,
                    cancellationToken);

            if (!requestedConfigurationExists)
            {
                throw new InvalidOperationException(
                    $"Prompt configuration {requestedPromptConfigurationId} was not found or is not eligible for case reviews.");
            }

            return requestedPromptConfigurationId;
        }

        return await editablePromptConfigurations
            .Where(configuration => configuration.CurrentPrompt)
            .OrderByDescending(configuration => configuration.ModifiedDttm)
            .ThenByDescending(configuration => configuration.PromptVersion)
            .Select(configuration => (long?)configuration.PromptConfigurationId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No current prompt configuration was found for case reviews.");
    }

    private async Task<List<CaseDocument>> GetDocumentsForQueueAsync(
        long caseId,
        QueueAiJobRequestViewModel request,
        CancellationToken cancellationToken)
    {
        var documentsQuery = _db.CaseDocuments
            .Where(document => document.IsRecordActive && document.CaseId == caseId);

        if (request.DocumentIds is { Count: > 0 })
        {
            documentsQuery = documentsQuery
                .Where(document => request.DocumentIds.Contains(document.DocumentId));
        }

        var documents = await documentsQuery
            .OrderByDescending(document => document.UploadedAt)
            .ToListAsync(cancellationToken);

        if (documents.Count == 0)
            throw new InvalidOperationException("No active documents were found for this case.");

        return documents;
    }

    private static void ValidateQueueRequest(QueueAiJobRequestViewModel request)
    {
        if (string.IsNullOrWhiteSpace(request.JobType))
            throw new ArgumentException("Job type is required.", nameof(request));
    }

    /*
       Collects the resolved prompt configuration, documents, and status codes
       needed to create a new queued review request.
    */
    private async Task<QueueRequestContext> BuildQueueContextAsync(
        long caseId,
        QueueAiJobRequestViewModel request,
        CancellationToken cancellationToken)
    {
        var jobType = request.JobType.Trim();
        var promptConfigurationId = await ResolvePromptConfigurationIdAsync(request, cancellationToken);
        var documents = await GetDocumentsForQueueAsync(caseId, request, cancellationToken);
        var codeValues = await AiJobCodeValues.LoadAsync(_db, cancellationToken);

        return new QueueRequestContext(
            promptConfigurationId,
            documents,
            codeValues.QueuedAiResponseStatus,
            codeValues.QueuedJobStatus,
            codeValues.RequestedJobType(jobType),
            await GetNextSuccessfulReviewVersionAsync(
                caseId,
                codeValues.CompletedAiResponseStatus.Value,
                cancellationToken),
            DateTime.UtcNow);
    }

    private async Task<int> GetNextSuccessfulReviewVersionAsync(
        long caseId,
        string completedAiResponseStatus,
        CancellationToken cancellationToken)
    {
        var currentMaxVersion = await _db.AiResponses
            .Where(response =>
                response.IsRecordActive &&
                response.CaseId == caseId &&
                response.AiStatus == completedAiResponseStatus)
            .Select(response => (int?)response.ReviewVersion)
            .MaxAsync(cancellationToken);

        return (currentMaxVersion ?? 0) + 1;
    }

    private AiResponse CreateQueuedAiResponse(long caseId, QueueRequestContext queueContext)
    {
        return new AiResponse
        {
            CaseId = caseId,
            AiStatusIndCode = queueContext.AiResponseQueuedStatus.CodeTypeCode,
            AiStatus = queueContext.AiResponseQueuedStatus.Value,
            PromptConfigurationId = queueContext.PromptConfigurationId,
            IsRecordActive = true,
            ReviewVersion = queueContext.ReviewVersion
        };
    }

    private static IEnumerable<AiResponseDocument> CreateResponseDocuments(
        long aiResponseId,
        IEnumerable<CaseDocument> documents)
    {
        return documents.Select(document => new AiResponseDocument
        {
            AiResponseId = aiResponseId,
            DocumentId = document.DocumentId,
            IsRecordActive = true
        });
    }

    private AiJobQueue CreateQueuedJob(
        long aiResponseId,
        long caseId,
        QueueAiJobRequestViewModel request,
        QueueRequestContext queueContext)
    {
        var payload = JsonSerializer.Serialize(new QueueJobPayload(
            caseId,
            queueContext.Documents.Select(document => document.DocumentId).ToArray(),
            NormalizeDocumentIds(request.UploadedDocumentIds),
            queueContext.PromptConfigurationId));

        return new AiJobQueue
        {
            AiResponseId = aiResponseId,
            JobTypeIndCode = queueContext.JobType.CodeTypeCode,
            JobType = queueContext.JobType.Value,
            Payload = payload,
            JobStatusIndCode = queueContext.JobQueuedStatus.CodeTypeCode,
            JobStatus = queueContext.JobQueuedStatus.Value,
            Attempts = 0,
            MaxAttempts = request.MaxAttempts ?? 3,
            ScheduledAt = queueContext.ScheduledAt,
            JobPriority = request.JobPriority ?? 5,
            IsRecordActive = true
        };
    }

    private async Task<bool> TryClaimJobAsync(
        long jobId,
        DateTime claimTimestamp,
        AiJobCodeValues codeValues,
        CancellationToken cancellationToken)
    {
        var updatedRows = await _db.AiJobQueues
            .Where(job =>
                job.JobId == jobId &&
                job.IsRecordActive &&
                codeValues.RunnableJobStatusValues.Contains(job.JobStatus))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(job => job.JobStatusIndCode, codeValues.ProcessingJobStatus.CodeTypeCode)
                .SetProperty(job => job.JobStatus, codeValues.ProcessingJobStatus.Value)
                .SetProperty(job => job.StartedAt, claimTimestamp)
                .SetProperty(job => job.Attempts, job => job.Attempts + 1)
                .SetProperty(job => job.ModifiedUser, _userAuditService.CurrentUserId),
                cancellationToken);

        return updatedRows > 0;
    }

    private async Task KeepJobLeaseAliveAsync(
        long jobId,
        string processingStatus,
        CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(ProcessingLeaseHeartbeatInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var heartbeatDb = scope.ServiceProvider.GetRequiredService<DivertCheckDbContext>();
                await heartbeatDb.AiJobQueues
                    .Where(job =>
                        job.JobId == jobId &&
                        job.IsRecordActive &&
                        job.JobStatus == processingStatus)
                    .ExecuteUpdateAsync(
                        setters => setters
                            .SetProperty(job => job.StartedAt, DateTime.UtcNow)
                            .SetProperty(job => job.ModifiedUser, _userAuditService.CurrentUserId),
                        cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Completed, failed, and shutting-down jobs do not need their lease renewed.
        }
    }

    /* created_user on the queue row is stamped with the requesting user when the
       job is inserted, so it is the record of who the background work belongs to.
       Read with AsNoTracking so the claim below still sees a clean entity. */
    private async Task<long> GetQueueingUserIdAsync(long jobId, CancellationToken cancellationToken)
    {
        return await _db.AiJobQueues
            .AsNoTracking()
            .Where(queueItem => queueItem.JobId == jobId)
            .Select(queueItem => queueItem.CreatedUser)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<AiJobQueue> LoadJobForProcessingAsync(long jobId, CancellationToken cancellationToken)
    {
        return await _db.AiJobQueues
            .Include(queueItem => queueItem.AiResponse)
                .ThenInclude(aiResponse => aiResponse!.PromptConfiguration)
                    .ThenInclude(promptConfiguration => promptConfiguration.Prompt)
            .Include(queueItem => queueItem.AiResponse)
                .ThenInclude(aiResponse => aiResponse!.AiResponseDocuments.Where(link => link.IsRecordActive))
                    .ThenInclude(link => link.Document)
            .FirstAsync(queueItem => queueItem.JobId == jobId, cancellationToken);
    }

    private static CaseDocument[] GetActiveDocuments(AiResponse aiResponse)
    {
        return aiResponse.AiResponseDocuments
            .Select(link => link.Document)
            .Where(document => document.IsRecordActive)
            .ToArray();
    }

    private async Task MarkJobCompletedAsync(
        AiJobQueue job,
        AiExecutionResult result,
        DateTime completionTimestamp,
        AiJobCodeValues codeValues,
        CancellationToken cancellationToken)
    {
        var aiResponse = job.AiResponse
            ?? throw new InvalidOperationException($"AI job {job.JobId} has no associated AI response.");

        aiResponse.ReviewVersion = await GetNextSuccessfulReviewVersionAsync(
            aiResponse.CaseId,
            codeValues.CompletedAiResponseStatus.Value,
            cancellationToken);
        aiResponse.AiStatusIndCode = codeValues.CompletedAiResponseStatus.CodeTypeCode;
        aiResponse.AiStatus = codeValues.CompletedAiResponseStatus.Value;
        aiResponse.AiFullResponse = result.FullResponse;
        aiResponse.AiSummaryResponse = result.SummaryResponse;
        aiResponse.CompletedAt = completionTimestamp;

        CompleteJob(job, codeValues.CompletedJobStatus, completionTimestamp);
    }

    /*
       Runs the claimed job from in-progress through completion and persists
       the generated output back onto the AI response record.
    */
    private async Task ProcessClaimedJobAsync(
        AiJobQueue job,
        AiJobCodeValues processingCodes,
        CancellationToken cancellationToken)
    {
        using var operation = _aiCancellationService.BeginOperation(
            BuildAiJobOperationKey(job.JobId),
            cancellationToken);

        LogJobClaimed(job.JobId, processingCodes.ProcessingJobStatus.Value);
        if (job.AiResponse is not null)
        {
            job.AiResponse.AiStatusIndCode = processingCodes.InProgressAiResponseStatus.CodeTypeCode;
            job.AiResponse.AiStatus = processingCodes.InProgressAiResponseStatus.Value;
        }
        job.ErrorMessage = null;
        await _userAuditService.SaveChangesAsync(cancellationToken);

        if (IsSuggestedPromptJob(job, processingCodes.SuggestedPromptJobType.Value))
        {
            await ExecuteSuggestedPromptJobAsync(job, operation.Token);
            operation.Token.ThrowIfCancellationRequested();

            CompleteJob(job, processingCodes.CompletedJobStatus, DateTime.UtcNow);
            await _userAuditService.SaveChangesAsync(operation.Token);
            LogJobCompleted(job.JobId, processingCodes.CompletedJobStatus.Value);
            return;
        }

        var aiResponse = job.AiResponse
            ?? throw new InvalidOperationException($"AI job {job.JobId} has no associated AI response.");
        var documents = GetActiveDocuments(aiResponse);
        var caseReviewResult = await ExecuteJobAsync(job, aiResponse, documents, operation.Token);
        operation.Token.ThrowIfCancellationRequested();
        EnsureNoLegacyTestOutput(caseReviewResult, job.JobId);

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            operation.Token);
        await MarkJobCompletedAsync(job, caseReviewResult, DateTime.UtcNow, processingCodes, operation.Token);
        await _userAuditService.SaveChangesAsync(operation.Token);
        await transaction.CommitAsync(operation.Token);

        LogJobCompleted(job.JobId, processingCodes.CompletedJobStatus.Value);
    }

    private void LogJobClaimed(long jobId, string status)
    {
        _logger.LogInformation(
            "Picked runnable job {JobId}. Status changed to {Status}.",
            jobId,
            status);
    }

    private void LogJobCompleted(long jobId, string status)
    {
        _logger.LogInformation(
            "Completed job {JobId}. Status changed to {Status}.",
            jobId,
            status);
    }

    private static string BuildAiJobOperationKey(long jobId) => $"ai-job:{jobId}";

    private async Task DeleteUploadedDocumentsForCanceledJobAsync(
        AiJobQueue job,
        CancellationToken cancellationToken)
    {
        if (job.AiResponse is null)
            return;

        var uploadedDocumentIds = GetUploadedDocumentIds(job.Payload).ToHashSet();
        if (uploadedDocumentIds.Count == 0)
            return;

        var documents = await _db.CaseDocuments
            .Where(document =>
                document.CaseId == job.AiResponse.CaseId &&
                uploadedDocumentIds.Contains(document.DocumentId) &&
                document.IsRecordActive)
            .ToListAsync(cancellationToken);

        if (documents.Count == 0)
            return;

        foreach (var document in documents)
        {
            document.IsRecordActive = false;
        }

        await _userAuditService.SaveChangesAsync(cancellationToken);

        foreach (var document in documents)
        {
            await _blobStorageService.DeleteIfExistsAsync(
                document.AzureStorageId,
                _azureStorageContainerName,
                cancellationToken);
        }
    }

    private static IReadOnlyCollection<long> GetUploadedDocumentIds(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return [];

        try
        {
            return NormalizeDocumentIds(JsonSerializer.Deserialize<QueueJobPayload>(payload)?.UploadedDocumentIds);
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static long[] NormalizeDocumentIds(IEnumerable<long>? documentIds) =>
        documentIds?
            .Where(documentId => documentId > 0)
            .Distinct()
            .ToArray() ?? [];

    private async Task ExecuteSuggestedPromptJobAsync(
        AiJobQueue job,
        CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Deserialize<SuggestedPromptJobPayload>(job.Payload)
            ?? throw new InvalidOperationException($"AI job {job.JobId} has an invalid suggested-prompt payload.");
        using var fileStream = payload.File is null
            ? null
            : new MemoryStream(payload.File.Content, writable: false);
        var result = await _promptConfigurationService.GenerateSuggestedPromptAsync(
            CreateSuggestedPromptRequest(payload, fileStream),
            cancellationToken);

        var suggestionResponse = new PromptSuggestionResponse
        {
            PromptConfigurationId = result.PromptConfigurationId,
            PromptType = result.PromptTarget,
            AiStatusIndCode = "AI_RESPONSE_STATUS",
            AiStatus = "COMPLETED",
            GeneratedPrompt = result.GeneratedPromptReview,
            RawResponse = JsonSerializer.Serialize(result, ApiJsonOptions),
            IsRecordActive = true
        };

        _db.PromptSuggestionResponses.Add(suggestionResponse);
        await _userAuditService.SaveChangesAsync(cancellationToken);

        job.PromptSuggestionResponseId = suggestionResponse.PromptSuggestionResponseId;
        await _userAuditService.SaveChangesAsync(cancellationToken);
    }

    private static async Task<SuggestedPromptJobPayload> CreateSuggestedPromptJobPayloadAsync(
        string promptType,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is not { Length: > 0 })
            return new SuggestedPromptJobPayload(promptType, null);

        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);

        return new SuggestedPromptJobPayload(
            promptType,
            new SuggestedPromptFile(
                Path.GetFileName(file.FileName),
                file.ContentType,
                stream.ToArray()));
    }

    private static GeneratePromptReviewRequestViewModel CreateSuggestedPromptRequest(
        SuggestedPromptJobPayload payload,
        Stream? fileStream)
    {
        if (payload.File is null || fileStream is null)
            return new GeneratePromptReviewRequestViewModel
            {
                PromptType = payload.PromptType
            };

        return new GeneratePromptReviewRequestViewModel
        {
            PromptType = payload.PromptType,
            File = new FormFile(fileStream, 0, fileStream.Length, "file", payload.File.FileName)
            {
                Headers = new HeaderDictionary(),
                ContentType = payload.File.ContentType
            }
        };
    }

    private async Task<AiJobStatusViewModel> MapJobStatusAsync(
        AiJobQueue job,
        CancellationToken cancellationToken)
    {
        string? lastFailureMessage = null;

        return new AiJobStatusViewModel(
            job.JobId,
            job.JobType,
            job.JobStatus,
            job.Attempts,
            job.ScheduledAt,
            job.StartedAt,
            job.CompletedAt,
            job.ErrorMessage,
            lastFailureMessage,
            job.AiResponseId,
            job.PromptSuggestionResponseId);
    }

    private static void EnsureNoLegacyTestOutput(AiExecutionResult result, long jobId)
    {
        if (StartsWithLegacyTestOutput(result.FullResponse) || StartsWithLegacyTestOutput(result.SummaryResponse))
        {
            throw new InvalidOperationException(
                $"AI job {jobId} produced a legacy test-output placeholder instead of a real AI response.");
        }
    }

    private static bool StartsWithLegacyTestOutput(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) &&
               value.TrimStart().StartsWith(LegacyTestOutputPrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static void CompleteJob(AiJobQueue job, CodeValueReference status, DateTime completedAt)
    {
        job.JobStatusIndCode = status.CodeTypeCode;
        job.JobStatus = status.Value;
        job.CompletedAt = completedAt;
        job.ErrorMessage = null;
    }

    private static bool IsSuggestedPromptJob(AiJobQueue job, string suggestedPromptJobType) =>
        string.Equals(job.JobType, suggestedPromptJobType, StringComparison.OrdinalIgnoreCase);

    private async Task<IReadOnlyCollection<AiDocumentContent>> LoadDocumentContentsAsync(
        IReadOnlyCollection<CaseDocument> documents,
        CancellationToken cancellationToken)
    {
        var loadedDocuments = new List<AiDocumentContent>(documents.Count);

        foreach (var document in documents)
        {
            var blobDownload = await _blobStorageService.DownloadAsync(
                document.AzureStorageId,
                _azureStorageContainerName);

            await using var sourceStream = blobDownload.Stream;
            using var buffer = new MemoryStream();
            await sourceStream.CopyToAsync(buffer, cancellationToken);

            loadedDocuments.Add(new AiDocumentContent(
                document.DocumentId,
                document.DocumentName,
                blobDownload.ContentType,
                buffer.ToArray(),
                IsTransactionEvidenceDocument: document.IsFinancialDocument));
        }

        return loadedDocuments;
    }

    private sealed record QueueRequestContext(
        long PromptConfigurationId,
        IReadOnlyCollection<CaseDocument> Documents,
        CodeValueReference AiResponseQueuedStatus,
        CodeValueReference JobQueuedStatus,
        CodeValueReference JobType,
        int ReviewVersion,
        DateTime ScheduledAt);

    private sealed record CaseReviewJobResult(
        long AiResponseId,
        long CaseId,
        string AiResponseStatus,
        string? FullResponse,
        string? SummaryResponse);

    private sealed record QueueJobPayload(
        [property: JsonPropertyName("caseId")] long CaseId,
        [property: JsonPropertyName("documentIds")] long[] DocumentIds,
        [property: JsonPropertyName("uploadedDocumentIds")] long[] UploadedDocumentIds,
        [property: JsonPropertyName("promptConfigurationId")] long PromptConfigurationId,
        [property: JsonPropertyName("lastFailureMessage")] string? LastFailureMessage = null);

    private sealed record SuggestedPromptJobPayload(
        string PromptType,
        SuggestedPromptFile? File);

    private sealed record SuggestedPromptFile(
        string FileName,
        string ContentType,
        byte[] Content);

    private static string UpdateJobPayloadLastFailureMessage(
        string payload,
        string failureMessage)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return payload;

        try
        {
            var currentPayload = JsonSerializer.Deserialize<QueueJobPayload>(payload);
            return currentPayload is null
                ? payload
                : JsonSerializer.Serialize(currentPayload with { LastFailureMessage = failureMessage });
        }
        catch (JsonException)
        {
            return payload;
        }
    }
}

public sealed record AiExecutionResult(
    string FullResponse,
    string SummaryResponse);
