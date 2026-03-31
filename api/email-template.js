const APP_URL = process.env.APP_URL || "https://points-are-bad.vercel.app";

export function emailHtml({ title, greeting, body, cta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="${APP_URL}/logo.png" alt="Points Are Bad" width="56" height="56" style="display:block;border-radius:14px;"/>
          <div style="margin-top:10px;font-size:11px;letter-spacing:3px;color:#555;text-transform:uppercase;">Points Are Bad</div>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#13131a;border:1px solid #1e1e2e;border-radius:16px;padding:36px 36px 32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f0f8;letter-spacing:-0.5px;">${title}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#666;border-bottom:1px solid #1e1e2e;padding-bottom:24px;">${greeting}</p>

          <div style="font-size:15px;line-height:1.65;color:#b0b0c8;">${body}</div>

          ${cta ? `
          <table cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr><td style="background:#f59e0b;border-radius:8px;">
              <a href="${cta.url}" style="display:block;padding:13px 28px;font-size:14px;font-weight:600;color:#000;text-decoration:none;letter-spacing:0.2px;">${cta.label}</a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:11px;color:#444;">
            Or copy this link: <a href="${cta.url}" style="color:#666;word-break:break-all;">${cta.url}</a>
          </p>` : ""}

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#333;line-height:1.6;">
            You're receiving this because you're a member of a group on<br/>
            <a href="${APP_URL}" style="color:#444;text-decoration:none;">points-are-bad.vercel.app</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
