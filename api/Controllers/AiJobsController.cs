//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/v1/ai-jobs")]
public sealed class AiJobsController : ControllerBase
{
    private readonly IAiJobService _aiJobService;

    public AiJobsController(IAiJobService aiJobService)
    {
        _aiJobService = aiJobService;
    }

    /// <summary>
    /// Gets the current status and, when available, output for any AI job.
    /// </summary>
    [HttpGet("{jobId:long}")]
    [ProducesResponseType(typeof(AiJobStatusViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AiJobStatusViewModel>> GetJobStatus(long jobId)
    {
        try
        {
            return Ok(await _aiJobService.GetJobStatusAsync(jobId, HttpContext.RequestAborted));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Cancels a queued or actively running AI job.
    /// </summary>
    [HttpPost("{jobId:long}/cancel")]
    [ProducesResponseType(typeof(CancelAiJobResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CancelAiJobResponseViewModel>> CancelJob(long jobId)
    {
        try
        {
            return Ok(await _aiJobService.CancelJobAsync(jobId, HttpContext.RequestAborted));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }
}
