//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace api.Services;

public class AiJobQueueHostedService : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    private readonly ILogger<AiJobQueueHostedService> _logger;
    private readonly IConfiguration _configuration;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ConcurrentDictionary<long, Task> _processingJobs = new();

    public AiJobQueueHostedService(
        ILogger<AiJobQueueHostedService> logger,
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _configuration = configuration;
        _scopeFactory = scopeFactory;
    }

    /* Starts the background polling loop and keeps the worker alive
       until the host shuts down or cancellation is requested. */
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AI job queue hosted service is starting.");

        using var timer = new PeriodicTimer(PollInterval);

        do
        {
            try
            {
                await ProcessQueuedJobsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "AI job queue tick failed. The next poll will retry.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("AI job queue hosted service is stopping.");
        return base.StopAsync(cancellationToken);
    }

    /* Pulls the next runnable job IDs, then fans them out in parallel
       using a bounded worker count so one slow job does not block others. */
    private async Task ProcessQueuedJobsAsync(CancellationToken cancellationToken)
    {
        RemoveCompletedJobs();

        var staleProcessingTimeoutSeconds = Math.Max(
            1,
            _configuration.GetValue<int?>("AiJobProcessing:StaleProcessingTimeoutSeconds") ?? 600);
        var configuredParallelism = _configuration.GetValue<int?>("AiJobProcessing:MaxParallelJobs") ?? 4;
        var maxParallelism = Math.Min(4, Math.Max(1, configuredParallelism));
        var availableSlots = maxParallelism - _processingJobs.Count;
        if (availableSlots <= 0)
            return;

        await using var scope = _scopeFactory.CreateAsyncScope();
        var jobService = scope.ServiceProvider.GetRequiredService<IAiJobService>();
        await jobService.RequeueStalledProcessingJobsAsync(
            TimeSpan.FromSeconds(staleProcessingTimeoutSeconds),
            cancellationToken);
        var batchSize = Math.Min(
            availableSlots,
            Math.Max(maxParallelism, _configuration.GetValue<int?>("AiJobProcessing:BatchSize") ?? 20));
        var queuedJobIds = await jobService.GetQueuedJobIdsAsync(batchSize, cancellationToken);

        if (queuedJobIds.Count == 0)
        {
            return;
        }

        _logger.LogInformation(
            "Processing {JobCount} queued AI job(s) with max parallelism {MaxParallelism}.",
            queuedJobIds.Count,
            maxParallelism);

        foreach (var jobId in queuedJobIds.Take(availableSlots))
            _processingJobs.TryAdd(jobId, RunJobAsync(jobId, cancellationToken));
    }

    private async Task RunJobAsync(long jobId, CancellationToken cancellationToken)
    {
        try
        {
            await using var jobScope = _scopeFactory.CreateAsyncScope();
            var jobService = jobScope.ServiceProvider.GetRequiredService<IAiJobService>();
            await jobService.ProcessJobAsync(jobId, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The normal stalled-job recovery path will reclaim this after shutdown.
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "AI job {JobId} escaped the worker execution path.", jobId);
        }
    }

    private void RemoveCompletedJobs()
    {
        foreach (var job in _processingJobs.Where(entry => entry.Value.IsCompleted))
            _processingJobs.TryRemove(job.Key, out _);
    }
}
