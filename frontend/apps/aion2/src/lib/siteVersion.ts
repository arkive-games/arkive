import { type ChangelogFile } from "@gamemap/ui";

import raw from "../changelog.json";

export const changelog = raw as ChangelogFile;

/**
 * Current site version — the newest changelog entry. Read from here (not from a
 * page component) so ContentLayout / TopNavbar / the changelog route don't form
 * an import cycle.
 */
export const SITE_VERSION = changelog.entries[0].version;
