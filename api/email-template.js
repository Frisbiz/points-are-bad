const APP_URL = process.env.APP_URL || "https://pab.wtf";

export function emailHtml({ title, greeting, body, cta }) {
  return `<!DOCTYPE html>
<html lang="en" bgcolor="#080810" style="background-color:#080810;">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap');</style>
<style>
  body, table, td, th, a { -webkit-text-size-adjust:100%; }
  .t-lo { color: #555566 !important; }
  .t-bd { color: #e8e4d9 !important; }
  .t-ft { color: #333 !important; }
  .t-cp { color: #555566 !important; }
  @media (prefers-color-scheme: light) {
    body, .ebg { background-color: #ffffff !important; }
    .ecard { background-color: #f4f4f4 !important; border-color: #e0e0e0 !important; }
    .etitle { color: #0f0d0a !important; border-color: #e0e0e0 !important; }
    .t-lo { color: #888 !important; }
    .t-bd { color: #1a1814 !important; }
    .t-ft { color: #aaa !important; }
    .t-cp { color: #888 !important; }
  }
</style>
</head>
<body bgcolor="#080810" style="margin:0;padding:0;background-color:#080810;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">

<table class="ebg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#080810" style="background-color:#080810;">
<tr><td class="ebg" bgcolor="#080810" style="background-color:#080810;padding:40px 16px;" align="center">

  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <!-- Text logo -->
    <tr><td class="ebg" bgcolor="#080810" style="background-color:#080810;padding-bottom:32px;" align="center">
      <div class="etitle" style="font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:22px;color:#fff;letter-spacing:-0.5px;line-height:1;">POINTS</div>
      <div class="t-lo" style="font-family:'DM Mono','SFMono-Regular',Consolas,monospace;font-size:9px;color:#555566;letter-spacing:4px;text-transform:uppercase;margin-top:3px;">are bad</div>
    </td></tr>

    <!-- Card -->
    <tr><td class="ecard" bgcolor="#0c0c18" style="background-color:#0c0c18;border:1px solid #1a1a26;border-radius:12px;padding:36px 36px 32px;">

      <p class="t-lo" style="margin:0 0 10px;font-size:12px;color:#555566;letter-spacing:0.5px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${greeting}</p>
      <h1 class="etitle" style="margin:0 0 24px;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1.15;border-bottom:1px solid #1a1a26;padding-bottom:20px;">${title}</h1>

      <div class="t-bd" style="font-size:13px;line-height:1.8;color:#e8e4d9;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${body}</div>

      ${cta ? `
      <table cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr><td bgcolor="#f59e0b" style="background-color:#f59e0b;border-radius:8px;">
          <a href="${cta.url}" style="display:block;padding:13px 28px;font-size:11px;font-weight:500;color:#000;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${cta.label}</a>
        </td></tr>
      </table>
      <p class="t-cp" style="margin:12px 0 0;font-size:11px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        or: <a href="${cta.url}" class="t-cp" style="color:#555566;word-break:break-all;">${cta.url}</a>
      </p>` : ""}

    </td></tr>

    <!-- Footer -->
    <tr><td class="ebg t-ft" bgcolor="#080810" style="background-color:#080810;padding-top:24px;" align="center">
      <p class="t-ft" style="margin:0;font-size:10px;color:#333;line-height:1.6;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        POINTS ARE BAD &middot; <a href="https://pab.wtf" class="t-ft" style="color:#444;text-decoration:none;">pab.wtf</a>
      </p>
    </td></tr>

  </table>

</td></tr>
</table>

</body>
</html>`;
}
