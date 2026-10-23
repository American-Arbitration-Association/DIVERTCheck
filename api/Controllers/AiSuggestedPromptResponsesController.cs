//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/v1/ai-suggested-prompt-response")]
public sealed class AiSuggestedPromptResponsesController : ControllerBase
{
    private readonly IAiSuggestedPromptResponseService _promptResponseService;

    public AiSuggestedPromptResponsesController(IAiSuggestedPromptResponseService promptResponseService)
    {
        _promptResponseService = promptResponseService;
    }

    /// <summary>
    /// Gets the saved suggested prompt response by its response id.
    /// </summary>
    [HttpGet("{promptSuggestionResponseId:long}")]
    [ProducesResponseType(typeof(AiSuggestedPromptResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AiSuggestedPromptResponseViewModel>> GetSuggestedPromptResponse(
        long promptSuggestionResponseId)
    {
        try
        {
            var response = await _promptResponseService.GetSuggestedPromptResponseAsync(
                promptSuggestionResponseId,
                HttpContext.RequestAborted);

            return response == null ? NotFound() : Ok(response);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
    }
}
