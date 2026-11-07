using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;
namespace SoftHome.Api.Controllers;
[ApiController, Authorize, Route("api/users")]
public class UsersController(AppDbContext db) : ControllerBase {
    [HttpGet]
    public async Task<IActionResult> GetUsers() {
        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var me = await db.Users.SingleOrDefaultAsync(u => u.Id == id && u.EmailConfirmed);
        if (me?.HouseholdId is null) return Unauthorized();
        return Ok(await db.Users.Where(u => u.HouseholdId == me.HouseholdId && u.EmailConfirmed)
            .Select(u => new { u.Id, u.Username }).ToListAsync());
    }
}
