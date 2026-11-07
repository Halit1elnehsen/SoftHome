using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace SoftHome.Api.Controllers;
// The former global endpoints are retired. All data access now uses the household-scoped API.
[ApiController, Authorize, Route("api/expenses")]
public class ExpensesController : ControllerBase {
    [Route("{**path}"), AcceptVerbs("GET", "POST", "PUT", "DELETE")]
    public IActionResult Retired() => StatusCode(410, new { message = "Bu uç nokta yenilendi. /api/workspace kullanın." });
}
