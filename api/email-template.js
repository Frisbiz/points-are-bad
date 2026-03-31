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
  body { background-color: #080810 !important; }
  table, td { background-color: #080810; }
</style>
</head>
<body bgcolor="#080810" style="margin:0;padding:0;background-color:#080810;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
<div style="background-color:#080810;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#080810" style="background-color:#080810;padding:40px 16px;">
    <tr><td align="center" bgcolor="#080810" style="background-color:#080810;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" bgcolor="#080810" style="background-color:#080810;padding-bottom:32px;">
          <img src="${APP_URL}/logo.png" alt="Points Are Bad" width="120" style="display:block;width:120px;height:auto;"/>
        </td></tr>

        <!-- Card -->
        <tr><td bgcolor="#0c0c18" style="background-color:#0c0c18;border:1px solid #1a1a26;border-radius:12px;padding:36px 36px 32px;">

          <p style="margin:0 0 10px;font-size:12px;color:#555566;letter-spacing:0.5px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${greeting}</p>
          <h1 style="margin:0 0 24px;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1.15;border-bottom:1px solid #1a1a26;padding-bottom:20px;">${title}</h1>

          <div style="font-size:13px;line-height:1.8;color:#e8e4d9;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${body}</div>

          ${cta ? `
          <table cellpadding="0" cellspacing="0" style="margin-top:32px;">
            <tr><td bgcolor="#f59e0b" style="background-color:#f59e0b;border-radius:8px;">
              <a href="${cta.url}" style="display:block;padding:13px 28px;font-size:11px;font-weight:500;color:#000;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${cta.label}</a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:11px;color:#333;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
            or: <a href="${cta.url}" style="color:#555566;word-break:break-all;">${cta.url}</a>
          </p>` : ""}

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" bgcolor="#080810" style="background-color:#080810;padding-top:24px;">
          <p style="margin:0;font-size:10px;color:#333;line-height:1.6;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
            POINTS ARE BAD &middot; <a href="https://pab.wtf" style="color:#444;text-decoration:none;">pab.wtf</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>
</body>
</html>`;
}
