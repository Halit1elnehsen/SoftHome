namespace SoftHome.Api.Services;

public static class ReceiptValidator
{
    public const int MaxBytes = 5 * 1024 * 1024;
    public static async Task<(byte[] Data, string ContentType)> ReadAsync(IFormFile file)
    {
        if (file.Length <= 0 || file.Length > MaxBytes) throw new ArgumentException("Fotoğraf en fazla 5 MB olabilir.");
        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer);
        var data = buffer.ToArray();
        if (data.Length > MaxBytes) throw new ArgumentException("Fotoğraf en fazla 5 MB olabilir.");
        if (data.Length >= 8 && data.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10})) return (data, "image/png");
        if (data.Length >= 4 && data[0] == 255 && data[1] == 216 && data[2] == 255 && data[^2] == 255 && data[^1] == 217) return (data, "image/jpeg");
        if (data.Length >= 12 && System.Text.Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(data, 8, 4) == "WEBP") return (data, "image/webp");
        throw new ArgumentException("JPEG, PNG veya WebP biçiminde bir fotoğraf seç.");
    }
}
