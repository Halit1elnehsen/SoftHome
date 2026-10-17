using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;

namespace SoftHome.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _context;

    public UsersController(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Sistemdeki tüm kullanıcıları listeler (Id, Username, Email).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _context.Users
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email
            })
            .ToListAsync();

        return Ok(users);
    }
}
