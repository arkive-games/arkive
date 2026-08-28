const LORD_OF_MYSTERIES_PATHS = [
  "/wiki/utopian-theater",
  "/wiki/traintrade",
  "/tools/traintrade-station",
] as const;

export function isLordOfMysteriesPath(pathname: string) {
  return LORD_OF_MYSTERIES_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
