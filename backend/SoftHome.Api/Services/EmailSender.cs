using System.Net;
using System.Net.Mail;
using System.Text.Encodings.Web;

namespace SoftHome.Api.Services;

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task SendConfirmationAsync(string recipient, string url);
    Task SendPasswordResetAsync(string recipient, string url);
}

public sealed class SmtpEmailSender(IConfiguration config) : IEmailSender
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(config["Email:SmtpHost"])
        && !string.IsNullOrWhiteSpace(config["Email:From"]);

    public Task SendConfirmationAsync(string recipient, string url) => SendAsync(recipient,
        "SoftHome e-posta adresini doğrula", "E-posta adresimi doğrula", url,
        "Hesabını etkinleştir, ev arkadaşlarına katıl.", "Bu bağlantı 24 saat geçerlidir.");

    public Task SendPasswordResetAsync(string recipient, string url) => SendAsync(recipient,
        "SoftHome şifreni yenile", "Yeni şifremi belirle", url,
        "Hesabına yeniden güvenle eriş.", "Bu bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir.");

    private async Task SendAsync(string recipient, string subject, string action, string url, string introduction, string expiry)
    {
        if (!IsConfigured) throw new InvalidOperationException("Email delivery is not configured.");
        using var message = new MailMessage(config["Email:From"]!, recipient)
        {
            Subject = subject,
            Body = $"<html lang=\"tr\"><body style=\"margin:0;background:#f3f5ef;font-family:Arial,sans-serif;color:#243c31;padding:32px 16px\"><div style=\"max-width:480px;margin:auto;background:#fff;border-radius:20px;padding:36px\"><p style=\"font-size:24px;font-weight:bold;color:#285b45\">softhome.</p><h1 style=\"font-size:24px\">{introduction}</h1><p style=\"line-height:1.7\">{expiry}</p><p style=\"margin:28px 0\"><a style=\"display:inline-block;background:#285b45;color:#fff;padding:16px 24px;border-radius:10px;text-decoration:none\" href=\"{HtmlEncoder.Default.Encode(url)}\">{action}</a></p><p style=\"font-size:13px;line-height:1.7;color:#647369\">Bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.</p></div></body></html>",
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
