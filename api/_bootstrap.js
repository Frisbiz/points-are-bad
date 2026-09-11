const DEFAULT_SITE_PREFERENCES = { defaultTheme: "dark", landingTheme: null };

export async function loadBootstrapData({ token, getSession, getValue, safeUser, normalizeGroup, prepareGroupForViewer = group => group }) {
  const [session, storedPreferences] = await Promise.all([
    getSession(token),
    getValue("site:preferences"),
  ]);
  const sitePreferences = storedPreferences && typeof storedPreferences === "object"
    ? { ...DEFAULT_SITE_PREFERENCES, ...storedPreferences }
    : DEFAULT_SITE_PREFERENCES;

  if (!session?.username) return { user: null, groups: [], sitePreferences };

  const user = await getValue(`user:${session.username}`);
  if (!user) return { user: null, groups: [], sitePreferences };

  const groupDocs = await Promise.all(
    (user.groupIds || []).map(id => getValue(`group:${id}`))
  );
  const groups = groupDocs
    .filter(group => group && (group.members || []).includes(session.username))
    .map(normalizeGroup)
    .map(group => prepareGroupForViewer(group, session.username));

  return { user: safeUser(user), groups, sitePreferences };
}
