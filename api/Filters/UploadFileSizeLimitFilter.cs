//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace api.Filters;

/// <summary>
/// Rejects any multipart request that contains a file larger than the per-file upload limit.
/// </summary>
public sealed class UploadFileSizeLimitFilter : IAsyncActionFilter
{
    public const long MaximumFileSizeBytes = 100L * 1024 * 1024;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var request = context.HttpContext.Request;

        if (request.HasFormContentType)
        {
            // The form is buffered once and cached, so controllers that call ReadFormAsync reuse it.
            var form = await request.ReadFormAsync(context.HttpContext.RequestAborted);
            var oversizedFile = form.Files.FirstOrDefault(file => file.Length > MaximumFileSizeBytes);

            if (oversizedFile is not null)
            {
                context.Result = new ObjectResult(
                    $"File '{oversizedFile.FileName}' is too large. Max file size is 100MB.")
                {
                    StatusCode = StatusCodes.Status413PayloadTooLarge
                };
                return;
            }
        }

        await next();
    }
}
