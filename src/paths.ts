const BASE_URL = import.meta.env.BASE_URL;

export function appPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function assetPath(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) {
    return path;
  }
  return path.startsWith("/") ? appPath(path) : path;
}

export function currentAppPath(pathname = location.pathname): string {
  const prefix = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  if (prefix === "" || prefix === "/") {
    return pathname;
  }
  if (pathname === prefix) {
    return "/";
  }
  return pathname.startsWith(`${prefix}/`)
    ? pathname.slice(prefix.length)
    : pathname;
}
