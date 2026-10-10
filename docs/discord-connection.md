# Discord Connection

## Member Flow

Open the PAB profile menu, choose **Account**, then **Connect Discord**.
Discord asks to share account identity only. After authorization, PAB returns
to the same Account dialog, with the connection shown and pick reminders enabled
for a first connection. Reauthorization preserves an existing reminders setting.

The connected section supports a reminders switch and inline disconnect
confirmation. Existing `/pab link` connections continue to work; older links
without profile metadata show **Connected** rather than an invented username.
The shared demo account cannot connect a Discord account.

## Required Configuration

Configure these server-only variables on the PAB Vercel project
`points-are-bad`:

```dotenv
APP_URL=https://www.pab.wtf
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Use Whistlebot's Discord application ID and **OAuth2 client secret**. The client
secret is not the Discord bot token and is not `PAB_DISCORD_SHARED_SECRET`.
Never prefix these values with `VITE_`, place them in a committed file, print
them, or paste them into chat.

Register this exact redirect in Discord Developer Portal > the application >
OAuth2 > Redirects:

```text
https://www.pab.wtf/api/security?action=discord-oauth-callback
```

The `www` domain is required: the apex site redirects there, and the PAB session
cookie belongs to the origin on which the member signed in. The callback uses
the configured canonical origin, never an arbitrary request Host header.

For local testing, configure a local HTTP APP_URL on localhost or 127.0.0.1 and
register the corresponding exact development callback. Do not use production
credentials in a public preview. When credentials are missing, existing
connections can still be managed, but no dead Connect button is displayed.

## Firestore Cleanup

OAuth attempts expire after ten minutes and are consumed once transactionally.
Expired records are deleted opportunistically, at most 25 per initiation. An
index or cleanup failure does not permit expired state to be accepted and does
not block initiation.

If Firestore requests an index for cleanup, create a composite index on the
`data` collection with `value.kind` ascending and `value.expiresAt` ascending.
No backfill of existing user or Discord-link records is required.

## Release Checklist

1. Run all PAB Node tests and the Vite production build.
2. Verify desktop/mobile Account screenshots in dark, light and Index themes.
3. Configure the exact Discord redirect and all three environment variables.
4. Deploy the reviewed feature revision through the existing Vercel project.
5. Verify the signed-in `discord-account-status` response is uncached and reports
   `oauthAvailable: true`. A signed-out request must return 401, not account data.
6. Have a willing account owner complete the real Discord authorization flow.
   Automation must not authorize on another person's behalf.
7. Confirm the returned Discord identity belongs to that member, preferences
   persist across reload, cancellation leaves links unchanged, and disconnect
   removes both directions of the connection.
8. Confirm `/pab link` and the bot's existing reminder jobs still work.

No Whistlebot restart or Discord slash-command registration is needed. Linking
does not trigger an immediate DM or reset delivered reminders; normal incomplete
pick reminders are processed at the next scheduler poll.

## Verification Record

The implementation was tested against injected provider/session/Firestore
adapters and local browser fixtures. These prove the application's behavior,
not that live Discord credentials or redirect registration are configured.

The baseline was 226 tests. Tests added for OAuth/state, transactional ownership,
browser actions and frontend response handling brought the suite to 260 tests
before final review. The build passed. Focused lint found no errors; App's
existing hook dependency warnings and large-bundle build warning remain.

Local browser checks covered 1440x900 desktop and 390x844 phone layouts in dark,
light and Index themes, long display names, failed preference save, successful
save, disconnect confirmation/cancel, and callback notice/query removal.
Screenshots are kept in ignored `output/playwright/discord-connection/`.

Live OAuth authorization and production rollout must be recorded separately
after the client secret and Discord redirect have been configured.

## Rollback

Revert the feature commits and redeploy the previous PAB revision. The existing
user/Discord-link/index records remain compatible with Whistlebot and the
original command-based linking flow. Do not delete links, reminder history,
the shared bot secret, or fixture data as part of a rollback.
