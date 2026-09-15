export function parseAppRoute(pathname = '/') {
  if (pathname === '/' || pathname === '') return { page: 'home' };
  if (pathname === '/signin') return { page: 'signin' };
  if (pathname === '/dashboard') return { page: 'dashboard' };
  if (pathname === '/link-discord') return { page: 'discord-link' };
  const match = pathname.match(/^\/groups\/([^/]+)\/?$/);
  if (match) {
    try {
      const groupId = decodeURIComponent(match[1]);
      if (groupId) return { page: 'group', groupId };
    } catch {
      return { page: 'not-found' };
    }
  }
  return { page: 'not-found' };
}

export function appPath(route) {
  if (route?.page === 'signin') return '/signin';
  if (route?.page === 'dashboard') return '/dashboard';
  if (route?.page === 'discord-link') return '/link-discord';
  if (route?.page === 'group' && route.groupId) return `/groups/${encodeURIComponent(route.groupId)}`;
  return '/';
}
