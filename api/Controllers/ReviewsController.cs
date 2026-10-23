//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class ReviewsController : ControllerBase
{
    private readonly IReviewService _reviewService;

    public ReviewsController(IReviewService reviewService)
    {
        _reviewService = reviewService;
    }

    [HttpGet("queue")]
    [ProducesResponseType(typeof(IEnumerable<ReviewQueueItemViewModel>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<ReviewQueueItemViewModel>>> ReviewQueue()
    {
        var reviewQueue = await _reviewService.GetReviewQueueAsync(HttpContext.RequestAborted);
        return Ok(reviewQueue);
    }

    [HttpGet("{aiResponseId:long}")]
    [ProducesResponseType(typeof(CaseReviewDetailViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CaseReviewDetailViewModel>> CaseReview(long aiResponseId)
    {
        var caseReview = await _reviewService.GetCaseReviewByAiResponseIdAsync(
            aiResponseId,
            HttpContext.RequestAborted);

        return caseReview == null ? NotFound() : Ok(caseReview);
    }

    [HttpGet("cases/{caseId:long}/history")]
    [ProducesResponseType(typeof(IEnumerable<ReviewHistoryItemViewModel>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<ReviewHistoryItemViewModel>>> CaseReviewHistory(long caseId)
    {
        var reviewHistory = await _reviewService.GetCaseReviewHistoryAsync(
            caseId,
            HttpContext.RequestAborted);

        return Ok(reviewHistory);
    }

    [HttpGet("cases/{caseId:long}/versions/{reviewVersion:int}")]
    [ProducesResponseType(typeof(CaseReviewDetailViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CaseReviewDetailViewModel>> CaseReviewVersion(long caseId, int reviewVersion)
    {
        var caseReview = await _reviewService.GetCaseReviewByVersionAsync(
            caseId,
            reviewVersion,
            HttpContext.RequestAborted);

        return caseReview == null ? NotFound() : Ok(caseReview);
    }
}
