//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

/// <summary>
/// Manages prompt configuration: current setup, version history, generated review content, and undo actions.
/// </summary>
[ApiController]
[Route("api/v1/prompt-configurations")]
public sealed class PromptConfigurationsController : ControllerBase
{
    private readonly IPromptConfigurationService _promptConfigurationService;
    private readonly IAiJobService _aiJobService;

    public PromptConfigurationsController(
        IPromptConfigurationService promptConfigurationService,
        IAiJobService aiJobService)
    {
        _promptConfigurationService = promptConfigurationService;
        _aiJobService = aiJobService;
    }

    /// <summary>
    /// Loads the current prompt-configuration page state.
    /// </summary>
    [HttpGet("current")]
    [ProducesResponseType(typeof(PromptConfigurationPageViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PromptConfigurationPageViewModel>> CurrentConfiguration()
    {
        try
        {
            var configuration = await _promptConfigurationService.GetCurrentConfigurationAsync(HttpContext.RequestAborted);
            return Ok(configuration);
        }
        catch (InvalidOperationException exception)
        {
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Loads a specific prompt configuration by id for version-history browsing.
    /// </summary>
    [HttpGet("versions/{promptConfigurationId}")]
    [ProducesResponseType(typeof(PromptConfigurationPageViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PromptConfigurationPageViewModel>> PromptConfigurationVersion(long promptConfigurationId)
    {
        try
        {
            var configuration = await _promptConfigurationService.GetPromptConfigurationAsync(promptConfigurationId, HttpContext.RequestAborted);
            return Ok(configuration);
        }
        catch (InvalidOperationException exception)
        {
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Activates one saved prompt-configuration version by configuration id.
    /// </summary>
    [HttpPut("versions/{promptConfigurationId:long}/set-current")]
    [ProducesResponseType(typeof(SetAsCurrentPromptConfigurationResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SetAsCurrentPromptConfigurationResponseViewModel>> SetAsCurrentPromptConfiguration(
        long promptConfigurationId)
    {
        try
        {
            var response = await _promptConfigurationService.SetAsCurrentPromptConfigurationAsync(
                promptConfigurationId,
                HttpContext.RequestAborted);
            return Ok(response);
        }
        catch (InvalidOperationException exception)
        {
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Queues generation of an editable prompt review from the saved current prompts and an optional reference
    /// document. Returns a job id; poll the AI job-status endpoint for the result. Send promptType=summary for
    /// summary prompt guidance, or omit it (or send promptType=main) for eligibility prompt guidance.
    /// </summary>
    [HttpPost("generate-suggested-prompt")]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(AiJobStatusViewModel), StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AiJobStatusViewModel>> GenerateSuggestedPrompt(
        [FromForm] GeneratePromptReviewRequestViewModel request)
    {
        try
        {
            var job = await _aiJobService.QueueSuggestedPromptJobAsync(request, HttpContext.RequestAborted);
            return AcceptedAtAction(
                nameof(AiJobsController.GetJobStatus),
                "AiJobs",
                new { jobId = job.JobId },
                job);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }

    /// <summary>
    /// Saves the configuration page as a newly versioned prompt configuration. Returns the refreshed
    /// configuration state plus the previous configuration id, so callers can offer an Undo action.
    /// </summary>
    [HttpPost("save")]
    [ProducesResponseType(typeof(ReplacePromptConfigurationResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ReplacePromptConfigurationResponseViewModel>> SaveConfiguration(
        [FromBody] ReplacePromptConfigurationRequestViewModel request)
    {
        try
        {
            var response = await _promptConfigurationService.SaveConfigurationAsync(request, HttpContext.RequestAborted);
            return Ok(response);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Restores the saved current prompt text after generated text was copied into an editor field.
    /// </summary>
    [HttpPost("current/undo-prompt-text")]
    [ProducesResponseType(typeof(UndoPromptTextUpdateResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UndoPromptTextUpdateResponseViewModel>> UndoPromptTextUpdate(
        [FromBody] UndoPromptTextUpdateRequestViewModel request)
    {
        try
        {
            var response = await _promptConfigurationService.UndoPromptTextUpdateAsync(request, HttpContext.RequestAborted);
            return Ok(response);
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
            return NotFound(exception.Message);
        }
    }

    /// <summary>
    /// Restores the previously active prompt configuration, removing the just-saved current version.
    /// </summary>
    [HttpPost("current/undo")]
    [ProducesResponseType(typeof(ReplacePromptConfigurationResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ReplacePromptConfigurationResponseViewModel>> UndoReplaceCurrentPrompt(
        [FromBody] UndoPromptConfigurationRequestViewModel request)
    {
        try
        {
            var response = await _promptConfigurationService.UndoReplaceCurrentPromptAsync(request, HttpContext.RequestAborted);
            return Ok(response);
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
            return NotFound(exception.Message);
        }
    }
}
