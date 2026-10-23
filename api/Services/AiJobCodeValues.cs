//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

internal sealed class AiJobCodeValues
{
    private const string Queued = "QUEUED";
    private const string Processing = "PROCESSING";
    private const string InProgress = "IN_PROGRESS";
    private const string Completed = "COMPLETED";
    private const string Failed = "FAILED";
    private const string Canceled = "CANCELED";
    private const string Cancelled = "CANCELLED";
    private const string Retry = "RETRY";
    private const string SuggestedPrompt = "SUGGESTED_PROMPT";

    private static readonly string[] AiResponseStatusSignature =
        [Queued, InProgress, Completed, Failed];
    private static readonly string[] JobStatusSignature =
        [Queued, Processing, Completed, Failed, Retry];
    private static readonly string[] CancellationPreference = [Canceled, Cancelled, Failed];

    private readonly CodeValueReference[] _values;
    private readonly string _aiResponseStatusType;
    private readonly string _jobStatusType;

    private AiJobCodeValues(CodeValueReference[] values)
    {
        _values = values;
        _aiResponseStatusType = ResolveType(AiResponseStatusSignature, "AI response status");
        _jobStatusType = ResolveType(JobStatusSignature, "job status");
    }

    public CodeValueReference QueuedAiResponseStatus => AiResponseStatus(Queued);
    public CodeValueReference InProgressAiResponseStatus => AiResponseStatus(InProgress);
    public CodeValueReference CompletedAiResponseStatus => AiResponseStatus(Completed);
    public CodeValueReference FailedAiResponseStatus => AiResponseStatus(Failed);
    public CodeValueReference QueuedJobStatus => JobStatus(Queued);
    public CodeValueReference ProcessingJobStatus => JobStatus(Processing);
    public CodeValueReference CompletedJobStatus => JobStatus(Completed);
    public CodeValueReference FailedJobStatus => JobStatus(Failed);
    public CodeValueReference RetryJobStatus => JobStatus(Retry);
    public CodeValueReference SuggestedPromptJobType => Unique(SuggestedPrompt, "suggested-prompt job type");
    public string[] RunnableJobStatusValues => [QueuedJobStatus.Value, RetryJobStatus.Value];

    public static async Task<AiJobCodeValues> LoadAsync(
        DivertCheckDbContext db,
        CancellationToken cancellationToken)
    {
        var values = await db.CodeValues
            .AsNoTracking()
            .Where(codeValue => codeValue.IsRecordActive)
            .Select(codeValue => new CodeValueReference(codeValue.CodeTypeCode, codeValue.Value))
            .ToArrayAsync(cancellationToken);

        return new AiJobCodeValues(values);
    }

    public CodeValueReference RequestedJobType(string value) => Unique(value.Trim(), "requested job type");

    public CodeValueReference CancellationStatus(string codeTypeCode) =>
        CancellationPreference
            .Select(value => Find(codeTypeCode, value))
            .FirstOrDefault(codeValue => codeValue is not null)
        ?? throw new InvalidOperationException(
            $"Missing active cancellation fallback code_values for type '{codeTypeCode}'.");

    private CodeValueReference AiResponseStatus(string value) => Get(_aiResponseStatusType, value);
    private CodeValueReference JobStatus(string value) => Get(_jobStatusType, value);

    private CodeValueReference Get(string codeTypeCode, string value) =>
        Find(codeTypeCode, value)
        ?? throw new InvalidOperationException(
            $"Missing active code_values row for type '{codeTypeCode}' and value '{value}'.");

    private CodeValueReference? Find(string codeTypeCode, string value) =>
        _values.FirstOrDefault(codeValue =>
            string.Equals(codeValue.CodeTypeCode, codeTypeCode, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(codeValue.Value, value, StringComparison.OrdinalIgnoreCase));

    private CodeValueReference Unique(string value, string usage)
    {
        var matches = _values
            .Where(codeValue => string.Equals(codeValue.Value, value, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        return matches.Length switch
        {
            1 => matches[0],
            0 => throw new InvalidOperationException(
                $"Missing active code_values row for {usage} value '{value}'."),
            _ => throw new InvalidOperationException(
                $"Multiple active code_values rows use {usage} value '{value}'.")
        };
    }

    private string ResolveType(IReadOnlyCollection<string> signature, string usage)
    {
        var matches = _values
            .GroupBy(codeValue => codeValue.CodeTypeCode, StringComparer.OrdinalIgnoreCase)
            .Where(group => signature.All(value => group.Any(codeValue =>
                string.Equals(codeValue.Value, value, StringComparison.OrdinalIgnoreCase))))
            .Select(group => group.Key)
            .ToArray();

        return matches.Length switch
        {
            1 => matches[0],
            0 => throw new InvalidOperationException($"No active code_values type identifies {usage}."),
            _ => throw new InvalidOperationException($"Multiple active code_values types identify {usage}.")
        };
    }
}

internal sealed record CodeValueReference(string CodeTypeCode, string Value);
