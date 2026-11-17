/* Native Supabase transport: no database or service-role credentials in clients. */
(function (root) {
  "use strict";
  const cfg = root.SOFTHOME_CONFIG;
  if (cfg?.mode !== "supabase") return;
  if (!root.SoftHomeSupabase?.createClient)
    throw new Error("SoftHome bağlantı dosyaları yüklenemedi.");
  const client = root.SoftHomeSupabase.createClient(
    cfg.url,
    cfg.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "softhome-auth-v1",
      },
    },
  );
  let channel = null,
    subscriptionGeneration = 0,
    recoveryVerifiedEmail = "",
    receiptBlob = "";
  const failure = (message, status = 400) =>
    Object.assign(new Error(message), { status });
  function check(error) {
    if (!error) return;
    const code = error.code || "";
    if (code === "email_not_confirmed")
      throw failure(
        "E-postana gelen 6 haneli kodu doğruladıktan sonra giriş yapabilirsin.",
        403,
      );
    if (code === "invalid_credentials")
      throw failure(
        "E-posta veya şifre hatalı. Kayıtlı hesabınla giriş yap.",
        401,
      );
    if (/otp_expired|token_expired|otp_disabled/.test(code))
      throw failure(
        "Kod yanlış, kullanılmış veya süresi dolmuş. Yeni bir kod iste.",
      );
    if (error.status === 429 || /rate_limit/.test(code))
      throw failure(
        "Çok sık deneme yapıldı. Yeni kod istemeden önce biraz bekle.",
        429,
      );
    if (/Oturum|Giriş yapman/.test(error.message || ""))
      throw failure(error.message, 401);
    if (error.status === 401 || /^PGRST30[123]$/.test(code))
      throw failure("Oturumun sona erdi. Tekrar giriş yap.", 401);
    if (code === "42501")
      throw failure(error.message || "Bu işlem için yetkin yok.", 403);
    if (code.startsWith("22"))
      throw failure(error.message || "Girdiğin bilgileri kontrol et.");
    if (error.status >= 500 || /email|smtp|mail/i.test(error.message || ""))
      throw failure(
        "E-posta gönderilemedi. Biraz sonra yeniden dene; ev yöneticisi e-posta ayarlarını kontrol edebilir.",
        503,
      );
    throw failure(
      "İşlem tamamlanamadı. Bağlantını ve girdiğin bilgileri kontrol edip tekrar dene.",
      error.status || 400,
    );
  }
  async function session() {
    const { data, error } = await client.auth.getSession();
    check(error);
    if (!data.session) throw failure("Giriş yapman gerekiyor.", 401);
    return data.session;
  }
  async function rpc(name, args = {}) {
    await session();
    const { data, error } = await client.rpc(name, args);
    check(error);
    return data;
  }
  async function compact(file) {
    if (file.size <= 1048576) return file;
    let image,
      url = "";
    try {
      if (root.createImageBitmap) image = await root.createImageBitmap(file);
      else {
        url = URL.createObjectURL(file);
        image = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = url;
        });
      }
      const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size <= 1048576)
          return new File([blob], "fatura.jpg", { type: "image/jpeg" });
      }
      throw failure("Fotoğraf küçültülemedi. Daha küçük bir fotoğraf seç.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      image?.close?.();
    }
  }
  async function edge(method, body, id) {
    const s = await session();
    const response = await fetch(
      cfg.url +
        "/functions/v1/" +
        cfg.receiptFunction +
        (id ? "?expenseId=" + encodeURIComponent(id) : ""),
      {
        method,
        headers: {
          apikey: cfg.publishableKey,
          Authorization: "Bearer " + s.access_token,
        },
        body,
      },
    );
    if (!response.ok) {
      let info;
      try {
        info = await response.json();
      } catch {}
      throw failure(
        info?.message || "Fatura işlemi tamamlanamadı.",
        response.status,
      );
    }
    return method === "GET"
      ? response.blob()
      : response.status === 204
        ? null
        : response.json();
  }
  async function request(path, options = {}) {
    const method = options.method || "GET";
    const body =
      options.body && !(options.body instanceof FormData)
        ? JSON.parse(options.body)
        : options.body;
    if (path === "/api/auth/csrf") return { token: "supabase-bearer" };
    if (path === "/api/auth/register") {
      const settings = await fetch(cfg.url + "/auth/v1/settings", {
        headers: { apikey: cfg.publishableKey },
      }).then((r) => {
        if (!r.ok) throw failure("Hesap hizmetine ulaşılamadı.", 503);
        return r.json();
      });
      if (settings.mailer_autoconfirm)
        throw failure(
          "Hesap hizmetinde e-posta doğrulaması etkinleştirilmeli.",
          503,
        );
      const { data, error } = await client.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { name: body.name, householdName: body.householdName },
        },
      });
      check(error);
      if (data.session) {
        await client.auth.signOut({ scope: "local" });
        throw failure(
          "Hesap hizmetinde e-posta doğrulaması etkinleştirilmeli.",
          503,
        );
      }
      return {
        requiresVerification: true,
        email: body.email,
        message:
          "E-postana gönderilen 6 haneli kodu gir. Gelen kutunu ve spam klasörünü kontrol et.",
      };
    }
    if (path === "/api/auth/verify-code") {
      const { data, error } = await client.auth.verifyOtp({
        email: body.email,
        token: body.code,
        type: "signup",
      });
      check(error);
      if (!data.session)
        throw failure("Doğrulama tamamlanamadı. Yeni bir kod iste.");
      return { message: "Hesabın başarıyla oluşturuldu." };
    }
    if (path === "/api/auth/login") {
      const { error } = await client.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      check(error);
      return {};
    }
    if (path === "/api/auth/logout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      check(error);
      return null;
    }
    if (path === "/api/auth/resend-verification") {
      const { error } = await client.auth.resend({
        type: "signup",
        email: body.email,
      });
      check(error);
      return {
        requiresVerification: true,
        email: body.email,
        message:
          "Doğrulanmamış bir hesabın varsa yeni kod gönderilecek. Gelen kutunu ve spam klasörünü kontrol et.",
      };
    }
    if (path === "/api/auth/forgot-password") {
      recoveryVerifiedEmail = "";
      const { error } = await client.auth.resetPasswordForEmail(body.email);
      check(error);
      return {
        requiresRecoveryCode: true,
        email: body.email,
        message: "Bu adresle hesabın varsa şifre yenileme kodu gönderilecek.",
      };
    }
    if (path === "/api/auth/reset-code") {
      if (recoveryVerifiedEmail !== body.email) {
        const { data, error } = await client.auth.verifyOtp({
          email: body.email,
          token: body.code,
          type: "recovery",
        });
        check(error);
        if (!data.session) throw failure("Kod doğrulanamadı.");
        recoveryVerifiedEmail = body.email;
      }
      const { error } = await client.auth.updateUser({
        password: body.password,
      });
      check(error);
      const signedOut = await client.auth.signOut({ scope: "global" });
      check(signedOut.error);
      recoveryVerifiedEmail = "";
      return { message: "Şifren yenilendi. Yeni şifrenle giriş yapabilirsin." };
    }
    if (path === "/api/workspace") {
      const data = await rpc("softhome_workspace");
      data.expenses = data.expenses.map((e) => ({
        ...e,
        receiptUrl: e.hasReceipt ? "native-receipt:" + e.id : null,
      }));
      return data;
    }
    if (path === "/api/workspace/notifications")
      return rpc("softhome_notifications");
    if (path === "/api/workspace/notifications/read")
      return rpc("softhome_mark_read", { through_id: body.throughId });
    if (path === "/api/workspace/household" && method === "PUT")
      return rpc("softhome_update_house", {
        name: body.name,
        budget_cents: body.budgetCents,
      });
    if (path === "/api/workspace/household/invitation")
      return rpc("softhome_invite");
    if (path === "/api/workspace/household/join")
      return rpc("softhome_join", { code: body.code });
    if (path === "/api/workspace/payments")
      return rpc("softhome_payment", { payload: body });
    if (path === "/api/workspace/expenses" && method === "POST") {
      const file = body.get("receipt");
      if (file && file.size) {
        const upload = new FormData();
        upload.set("payload", body.get("payload"));
        upload.set("receipt", await compact(file));
        return edge("POST", upload);
      }
      return rpc("softhome_create_expense", {
        payload: JSON.parse(body.get("payload")),
        receipt_path: null,
        receipt_mime: null,
      });
    }
    const receipt = path.match(/^\/api\/workspace\/expenses\/(\d+)\/receipt$/);
    if (receipt && method === "PUT") {
      const upload = new FormData();
      upload.set("receipt", await compact(body.get("receipt")));
      return edge("PUT", upload, receipt[1]);
    }
    throw failure("Bu işlem bu sürümde kullanılamıyor.", 404);
  }
  root.SoftHomeRemote = {
    request,
    subscribe(hid, changed) {
      this.disconnect();
      const generation = subscriptionGeneration;
      void (async () => {
        const s = await session();
        await client.realtime.setAuth(s.access_token);
        if (generation !== subscriptionGeneration) return;
        channel = client
          .channel("softhome:household:" + hid, { config: { private: true } })
          .on("broadcast", { event: "changed" }, changed)
          .subscribe((status) => {
            if (status === "SUBSCRIBED") changed();
          });
      })().catch(() => {}); // The periodic refresh remains available while reconnecting.
    },
    disconnect() {
      subscriptionGeneration++;
      if (channel) {
        const old = channel;
        channel = null;
        void client.removeChannel(old).catch(() => {});
      }
    },
    async receiptUrl(expense) {
      if (expense.receiptPath) {
        const { data, error } = await client.storage
          .from("softhome-receipts")
          .createSignedUrl(expense.receiptPath, 300);
        check(error);
        return data.signedUrl;
      }
      if (receiptBlob) URL.revokeObjectURL(receiptBlob);
      receiptBlob = URL.createObjectURL(
        await edge("GET", undefined, expense.id),
      );
      return receiptBlob;
    },
  };
})(window);
