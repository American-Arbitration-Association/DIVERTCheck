//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Security.Claims;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AuthController(
    IAuthService authService,
    ILogger<AuthController> logger) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("users")]
    [ProducesResponseType(typeof(AuthUserViewModel), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AuthUserViewModel>> CreateUser(
        [FromBody] AuthCreateUserRequestViewModel request,
        CancellationToken cancellationToken)
    {
        try
        {
            var user = await authService.CreateUserAsync(request, cancellationToken);

            return CreatedAtAction(nameof(Me), routeValues: null, value: user);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(new { message = exception.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("reset-password/verify-email")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> VerifyPasswordResetEmail(
        [FromBody] AuthVerifyPasswordResetRequestViewModel request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await authService.IsPasswordResetEmailValidAsync(request, cancellationToken);
            return result == PasswordResetCodeVerificationResult.Valid
                ? Ok(new { message = "Email and security code are valid." })
                : Unauthorized(new { message = result switch
                {
                    PasswordResetCodeVerificationResult.Expired => "This code has expired. Please reset again",
                    PasswordResetCodeVerificationResult.TooManyAttempts =>
                        "Too many incorrect attempts. Please request a new code.",
                    _ => "Invalid security code"
                } });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new { message = exception.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("reset-password/generate-otp")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GeneratePasswordResetOtp(
        [FromBody] AuthForgotPasswordRequestViewModel request,
        CancellationToken cancellationToken)
    {
        try
        {
            var lifetime = await authService.GeneratePasswordResetOtpAsync(request, cancellationToken);
            return Ok(new
            {
                message = "A security code has been sent.",
                expiresInMinutes = (int)lifetime.TotalMinutes
            });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new { message = exception.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("forgot-password")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] AuthForgotPasswordRequestViewModel request,
        CancellationToken cancellationToken)
    {
        try
        {
            await authService.GeneratePasswordResetOtpAsync(request, cancellationToken);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
        catch (KeyNotFoundException)
        {
            // Avoid disclosing account existence through the compatibility endpoint.
        }

        return Ok(new { message = "If an account exists for that email, a security code has been sent." });
    }

    [AllowAnonymous]
    [HttpPost("reset-password")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ResetPassword(
        [FromBody] AuthResetPasswordRequestViewModel request,
        CancellationToken cancellationToken)
    {
        try
        {
            await authService.ResetPasswordAsync(request, cancellationToken);
            return Ok(new { message = "Password has been reset." });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
        catch (UnauthorizedAccessException exception)
        {
            return Unauthorized(new { message = exception.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthLoginResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<ActionResult<AuthLoginResponseViewModel>> Login(
        [FromBody] AuthLoginRequestViewModel request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            logger.LogWarning("Login rejected because required credentials were missing.");
            return BadRequest(new { message = "Email and password are required." });
        }

        AuthLoginResult result;
        try
        {
            result = await authService.LoginAsync(request, cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Login failed because of an unexpected server error.");
            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { message = "Unable to login right now. Please try again later." });
        }

        if (result.LockedUntilUtc.HasValue)
        {
            logger.LogWarning("Login rejected because the account is locked.");
            var retryAfterSeconds = Math.Max(
                1,
                (int)Math.Ceiling((result.LockedUntilUtc.Value - DateTimeOffset.UtcNow).TotalSeconds));
            Response.Headers.RetryAfter = retryAfterSeconds.ToString();

            return StatusCode(
                StatusCodes.Status423Locked,
                new
                {
                    message = "Account is locked after four consecutive failed login attempts. Try again in 15 minutes or reset your password.",
                    lockedUntilUtc = result.LockedUntilUtc
                });
        }

        if (result.Response == null)
        {
            logger.LogWarning("Login rejected because the credentials were invalid.");
            return Unauthorized(new { message = "Invalid email/password." });
        }

        logger.LogInformation("Login succeeded for user {UserId}.", result.Response.User.UserId);
        return Ok(result.Response);
    }

    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(AuthUserViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AuthUserViewModel>> Me(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var user = await authService.GetUserAsync(userId, cancellationToken);
        return user == null ? NotFound() : Ok(user);
    }

    [Authorize]
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Logout() =>
        Ok(new { message = "Logged out. Remove the bearer token on the client." });

    private bool TryGetCurrentUserId(out long userId) =>
        long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
}
