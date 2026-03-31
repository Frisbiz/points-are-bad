const APP_URL = process.env.APP_URL || "https://pab.wtf";

export function emailHtml({ title, greeting, body, cta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap');
  :root { color-scheme: light dark; }

  /* Light mode (default) — matches app light theme */
  .email-bg   { background-color: #f4f1e8 !important; }
  .email-card { background-color: #eeeae0 !important; border-color: #dddad0 !important; }
  .email-title { color: #0f0d0a !important; }
  .email-greeting { color: #888 !important; }
  .email-body { color: #1a1814 !important; }
  .email-divider { border-color: #dddad0 !important; }
  .email-footer { color: #aaa !important; }
  .email-footer a { color: #aaa !important; }
  .email-copy-link { color: #888 !important; }
  .email-copy-link a { color: #888 !important; }

  /* Dark mode overrides */
  @media (prefers-color-scheme: dark) {
    .email-bg   { background-color: #080810 !important; }
    .email-card { background-color: #0c0c18 !important; border-color: #1a1a26 !important; }
    .email-title { color: #ffffff !important; }
    .email-greeting { color: #555566 !important; }
    .email-body { color: #e8e4d9 !important; }
    .email-divider { border-color: #1a1a26 !important; }
    .email-footer { color: #333 !important; }
    .email-footer a { color: #444 !important; }
    .email-copy-link { color: #333 !important; }
    .email-copy-link a { color: #555566 !important; }
  }
</style>
</head>
<body class="email-bg" bgcolor="#f4f1e8" style="margin:0;padding:0;background-color:#f4f1e8;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
<div class="email-bg" style="background-color:#f4f1e8;padding:40px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">

    <!-- Text logo -->
    <tr><td align="center" style="padding-bottom:32px;">
      <div class="email-title" style="font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:22px;color:#0f0d0a;letter-spacing:-0.5px;line-height:1;">POINTS</div>
      <div class="email-greeting" style="font-family:'DM Mono','SFMono-Regular',Consolas,monospace;font-size:9px;color:#888;letter-spacing:4px;text-transform:uppercase;margin-top:3px;">are bad</div>
    </td></tr>

    <!-- Card -->
    <tr><td class="email-card" bgcolor="#eeeae0" style="background-color:#eeeae0;border:1px solid #dddad0;border-radius:12px;padding:36px 36px 32px;">

      <p class="email-greeting" style="margin:0 0 10px;font-size:12px;color:#888;letter-spacing:0.5px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${greeting}</p>
      <h1 class="email-title email-divider" style="margin:0 0 24px;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:900;color:#0f0d0a;letter-spacing:-0.5px;line-height:1.15;border-bottom:1px solid #dddad0;padding-bottom:20px;">${title}</h1>

      <div class="email-body" style="font-size:13px;line-height:1.8;color:#1a1814;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${body}</div>

      ${cta ? `
      <table cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr><td bgcolor="#f59e0b" style="background-color:#f59e0b;border-radius:8px;">
          <a href="${cta.url}" style="display:block;padding:13px 28px;font-size:11px;font-weight:500;color:#000;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${cta.label}</a>
        </td></tr>
      </table>
      <p class="email-copy-link" style="margin:12px 0 0;font-size:11px;color:#888;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        or: <a href="${cta.url}" class="email-copy-link" style="color:#888;word-break:break-all;">${cta.url}</a>
      </p>` : ""}

    </td></tr>

    <!-- Footer -->
    <tr><td align="center" style="padding-top:24px;">
      <p class="email-footer" style="margin:0;font-size:10px;color:#aaa;line-height:1.6;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        POINTS ARE BAD &middot; <a href="https://pab.wtf" class="email-footer" style="color:#aaa;text-decoration:none;">pab.wtf</a>
      </p>
    </td></tr>

  </table>
</div>
</body>
</html>`;
}
