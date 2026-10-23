//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.Services.Interfaces;

public interface IAiCancellationService
{
    ActiveAiOperation BeginOperation(string operationKey, CancellationToken cancellationToken);

    bool CancelOperation(string operationKey);

    void RequestOperationCancellation(string operationKey);
}
