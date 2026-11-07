using System.Net;
using System.Net.Mail;
using System.Text.Encodings.Web;

namespace SoftHome.Api.Services;

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task SendConfirmationAsync(string recipient, string url);
}

public sealed class SmtpEmailSender(IConfiguration config) : IEmailSender
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(config["Email:SmtpHost"])
        && !string.IsNullOrWhiteSpace(config["Email:From"]);

    public async Task SendConfirmationAsync(string recipient, string url)
    {
        if (!IsConfigured) throw new InvalidOperationException("Email delivery is not configured.");
        using var message = new MailMessage(config["Email:From"]!, recipient)
        {
            Subject = "SoftHome e-posta adresini doğrula",
            Body = $"<p>SoftHome hesabını etkinleştirmek için e-posta adresini doğrula.</p><p><a href=\"{HtmlEncoder.Default.Encode(url)}\">E-posta adresimi doğrula</a></p><p>Bağlantı 24 saat geçerlidir. Bu kaydı sen oluşturmadıysan bu e-postayı yok sayabilirsin.</p>",
            IsBodyHtml = true
        };
        using var client = new SmtpClient(config["Email:SmtpHost"], config.GetValue("Email:SmtpPort", 587))
        {
            EnableSsl = true,
            Timeout = 15000
        };
        if (!string.IsNullOrWhiteSpace(config["Email:SmtpUsername"]))
            client.Credentials = new NetworkCredential(config["Email:SmtpUsername"], config["Email:SmtpPassword"]);
        await client.SendMailAsync(message);
    }
}
