//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Collections.Concurrent;
using api.Services.Interfaces;

namespace api.Services;

public sealed class AiCancellationService : IAiCancellationService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _operations = new();
    private readonly ConcurrentDictionary<string, byte> _pendingCancellations = new();

    public ActiveAiOperation BeginOperation(string operationKey, CancellationToken cancellationToken)
    {
        var key = NormalizeOperationKey(operationKey);
        var tokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        if (!_operations.TryAdd(key, tokenSource))
        {
            tokenSource.Dispose();
            throw new InvalidOperationException($"AI operation '{key}' is already running.");
        }

        if (_pendingCancellations.ContainsKey(key))
            tokenSource.Cancel();

        return new ActiveAiOperation(key, tokenSource, EndOperation);
    }

    public bool CancelOperation(string operationKey)
    {
        if (!_operations.TryGetValue(NormalizeOperationKey(operationKey), out var tokenSource))
            return false;

        try
        {
            tokenSource.Cancel();
            return true;
        }
        catch (ObjectDisposedException)
        {
            return false;
        }
    }

    public void RequestOperationCancellation(string operationKey)
    {
        var key = NormalizeOperationKey(operationKey);
        _pendingCancellations.TryAdd(key, 0);
        CancelOperation(key);
    }

    private void EndOperation(string operationKey)
    {
        _operations.TryRemove(operationKey, out _);
        _pendingCancellations.TryRemove(operationKey, out _);
    }

    private static string NormalizeOperationKey(string operationKey)
    {
        if (string.IsNullOrWhiteSpace(operationKey))
            throw new ArgumentException("Operation key is required.", nameof(operationKey));

        return operationKey.Trim();
    }
}

public sealed class ActiveAiOperation : IDisposable
{
    private readonly CancellationTokenSource _tokenSource;
    private readonly Action<string> _onDispose;
    private int _disposed;

    public ActiveAiOperation(string operationKey, CancellationTokenSource tokenSource, Action<string> onDispose)
    {
        OperationKey = operationKey;
        _tokenSource = tokenSource;
        _onDispose = onDispose;
    }

    public string OperationKey { get; }

    public CancellationToken Token => _tokenSource.Token;

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1)
            return;

        _onDispose(OperationKey);
        _tokenSource.Dispose();
    }
}
