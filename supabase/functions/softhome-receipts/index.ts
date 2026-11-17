import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const modernSecrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const secret =
  (Object.values(modernSecrets).find(
    (v) => typeof v === "string" && v.startsWith("sb_secret_"),
  ) as string) || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = "softhome-receipts";
const mimeTypes = ["image/jpeg", "image/png", "image/webp"];
const maxFile = 1048576;

class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function mimeOf(b: Uint8Array) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return mimeTypes[0];
  if (
    b.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  )
    return mimeTypes[1];
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return mimeTypes[2];
  throw new RequestError("JPEG, PNG veya WebP fotoğrafı seç.");
}
async function boundedForm(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError("Fotoğraf seç.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2 * maxFile) {
      await reader.cancel();
      throw new RequestError("Fotoğraf çok büyük.", 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    all.set(part, offset);
    offset += part.length;
  }
  return new Response(all, {
    headers: { "Content-Type": req.headers.get("Content-Type") || "" },
  }).formData();
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    origin === "https://appassets.androidplatform.net" ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Headers"] =
    "authorization, apikey, content-type, x-client-info";
  headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: allowed ? 204 : 403, headers });
  if (origin && !allowed)
    return json({ message: "Bu kaynaktan erişim desteklenmiyor." }, 403);
  if (!["GET", "POST", "PUT"].includes(req.method))
    return json({ message: "İşlem desteklenmiyor." }, 405);
  let uploaded: string | null = null;
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer "))
      throw new RequestError("Giriş yapman gerekiyor.", 401);
    const user = createClient(url, publicKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const checked = await user.auth.getUser(auth.slice(7));
    if (checked.error || !checked.data.user?.email_confirmed_at)
      throw new RequestError("Giriş yapman gerekiyor.", 401);
    const context = await user.rpc("softhome_context");
    if (context.error)
      throw new RequestError("Oturumun sona erdi. Tekrar giriş yap.", 401);
    const idText = new URL(req.url).searchParams.get("expenseId");
    const id = idText && /^\d+$/.test(idText) ? Number(idText) : null;
    if (req.method === "GET") {
      if (!id) throw new RequestError("Fatura seç.");
      const { data, error } = await user.rpc("softhome_receipt_info", {
        expense_id: id,
      });
      if (error || !mimeTypes.includes(data?.mime))
        throw new RequestError("Bu faturaya erişilemiyor.", 404);
      let image: Blob | ArrayBuffer;
      if (data.path) {
        const result = await admin.storage.from(bucket).download(data.path);
        if (result.error || !result.data)
          throw new RequestError("Fotoğraf yüklenemedi.", 404);
        image = result.data;
      } else if (data.data)
        image = Uint8Array.from(atob(data.data.replace(/\s/g, "")), (c) =>
          c.charCodeAt(0),
        ).buffer;
      else throw new RequestError("Fatura fotoğrafı bulunamadı.", 404);
      return new Response(image, {
        headers: { ...headers, "Content-Type": data.mime },
      });
    }
    let previous: { path: string | null } | null = null;
    if (req.method === "PUT") {
      if (!id) throw new RequestError("Fatura seç.");
      const info = await user.rpc("softhome_receipt_info", { expense_id: id });
      if (info.error || !info.data?.canEdit)
        throw new RequestError("Bu faturayı değiştirme yetkin yok.", 403);
      previous = info.data;
    }
    const form = await boundedForm(req);
    const file = form.get("receipt");
    if (!(file instanceof File) || !file.size || file.size > maxFile)
      throw new RequestError("En fazla 1 MB fotoğraf yüklenebilir.", 413);
    let payload: unknown;
    if (req.method === "POST") {
      try {
        payload = JSON.parse(String(form.get("payload")));
      } catch {
        throw new RequestError("Harcama bilgileri okunamadı.");
      }
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = mimeOf(bytes);
    if (file.type && file.type !== mime)
      throw new RequestError("Fotoğraf biçimi dosya içeriğiyle uyuşmuyor.");
    const extension =
      mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
    const path =
      String(context.data.householdId) +
      "/" +
      crypto.randomUUID() +
      "." +
      extension;
    const saved = await admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (saved.error)
      throw new RequestError(
        "Fotoğraf kaydedilemedi. Depolama alanını veya bağlantını kontrol et.",
        503,
      );
    uploaded = path;
    const result =
      req.method === "POST"
        ? await user.rpc("softhome_create_expense", {
            payload,
            receipt_path: path,
            receipt_mime: mime,
          })
        : await user.rpc("softhome_replace_receipt", {
            expense_id: id,
            receipt_path: path,
            receipt_mime: mime,
          });
    if (result.error) {
      // Explicit database rejection rolls back the record; a network failure may
      // have committed, so never delete a possibly referenced file on uncertainty.
      if (/^[0-9A-Z]{5}$/.test(result.error.code || ""))
        await admin.storage.from(bucket).remove([path]);
      uploaded = null;
      throw new RequestError(
        /^[24]/.test(result.error.code || "")
          ? result.error.message
          : "İşlem doğrulanamadı. Kayıtları kontrol edip tekrar dene.",
        result.error.code === "42501" ? 403 : 400,
      );
    }
    if (previous?.path && previous.path !== path)
      await admin.storage.from(bucket).remove([previous.path]);
    return req.method === "PUT"
      ? new Response(null, { status: 204, headers })
      : json(result.data, 201);
  } catch (error) {
    if (!(error instanceof RequestError))
      console.error("Receipt operation failed", { uploaded: !!uploaded });
    return json(
      {
        message:
          error instanceof RequestError
            ? error.message
            : "İşlem tamamlanamadı. Tekrar dene.",
      },
      error instanceof RequestError ? error.status : 500,
    );
  }
});
