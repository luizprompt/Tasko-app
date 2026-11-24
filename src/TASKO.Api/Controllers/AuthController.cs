using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tasko.Application.Contracts;
using Tasko.Application.Services;

namespace Tasko.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("register")]
    [EnableRateLimiting("AuthAttempts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var response = await auth.RegisterAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpPost("login")]
    [EnableRateLimiting("AuthAttempts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) =>
        auth.LoginAsync(request, ct);

    [HttpPost("refresh")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public Task<AuthResponse> Refresh(RefreshRequest request, CancellationToken ct) =>
        auth.RefreshAsync(request, ct);

    [HttpPost("logout")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(LogoutRequest request, CancellationToken ct)
    {
        await auth.LogoutAsync(request, ct);
        return NoContent();
    }

    [HttpPost("forgot-password")]
    [EnableRateLimiting("AuthAttempts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ForgotPasswordResponse), StatusCodes.Status200OK)]
    public Task<ForgotPasswordResponse> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct) =>
        auth.ForgotPasswordAsync(request, ct);

    [HttpPost("reset-password")]
    [EnableRateLimiting("AuthAttempts")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return NoContent();
    }
}
