const APP_URL = process.env.APP_URL || "https://pab.wtf";

export function emailHtml({ title, greeting, body, cta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;900&display=swap');</style>
<style>
  /* Dark by default */
  .bg   { background-color: #080810 !important; }
  .card { background-color: #0c0c18 !important; border-color: #1a1a26 !important; }
  .t-hi { color: #ffffff !important; }
  .t-lo { color: #555566 !important; }
  .t-bd { color: #e8e4d9 !important; }
  .t-ft { color: #333 !important; }
  .t-ft a { color: #444 !important; }
  .t-cp a { color: #555566 !important; }
  .div  { border-color: #1a1a26 !important; }

  /* Light mode override */
  @media (prefers-color-scheme: light) {
    .bg   { background-color: #ffffff !important; }
    .card { background-color: #f4f4f4 !important; border-color: #e0e0e0 !important; }
    .t-hi { color: #0f0d0a !important; }
    .t-lo { color: #888 !important; }
    .t-bd { color: #1a1814 !important; }
    .t-ft { color: #aaa !important; }
    .t-ft a { color: #aaa !important; }
    .t-cp a { color: #888 !important; }
    .div  { border-color: #dddad0 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#080810;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
<div class="bg" style="background-color:#080810;padding:40px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">

    <!-- Text logo -->
    <tr><td align="center" class="bg" style="background-color:#080810;padding-bottom:32px;">
      <div class="t-hi" style="font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:22px;color:#fff;letter-spacing:-0.5px;line-height:1;">POINTS</div>
      <div class="t-lo" style="font-family:'DM Mono','SFMono-Regular',Consolas,monospace;font-size:9px;color:#555566;letter-spacing:4px;text-transform:uppercase;margin-top:3px;">are bad</div>
    </td></tr>

    <!-- Card -->
    <tr><td class="card" style="background-color:#0c0c18;border:1px solid #1a1a26;border-radius:12px;padding:36px 36px 32px;">

      <p class="t-lo" style="margin:0 0 10px;font-size:12px;color:#555566;letter-spacing:0.5px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${greeting}</p>
      <h1 class="t-hi div" style="margin:0 0 24px;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1.15;border-bottom:1px solid #1a1a26;padding-bottom:20px;">${title}</h1>

      <div class="t-bd" style="font-size:13px;line-height:1.8;color:#e8e4d9;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${body}</div>

      ${cta ? `
      <table cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr><td style="background-color:#f59e0b;border-radius:8px;">
          <a href="${cta.url}" style="display:block;padding:13px 28px;font-size:11px;font-weight:500;color:#000;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">${cta.label}</a>
        </td></tr>
      </table>
      <p class="t-cp" style="margin:12px 0 0;font-size:11px;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        or: <a href="${cta.url}" style="color:#555566;word-break:break-all;">${cta.url}</a>
      </p>` : ""}

    </td></tr>

    <!-- Footer -->
    <tr><td align="center" class="bg" style="background-color:#080810;padding-top:24px;">
      <p class="t-ft" style="margin:0;font-size:10px;color:#333;line-height:1.6;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono','SFMono-Regular',Consolas,monospace;">
        POINTS ARE BAD &middot; <a href="https://pab.wtf" style="color:#444;text-decoration:none;">pab.wtf</a>
      </p>
    </td></tr>

  </table>
</div>
</body>
</html>`;
}
