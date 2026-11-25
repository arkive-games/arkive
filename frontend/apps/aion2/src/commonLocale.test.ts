/// <reference types="node" />
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vitest";

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  return Object.entries(value as object).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key));
}

function catalog(locale: string) {
  return new Map(leaves(parse(readFileSync(new URL(`../public/locales/${locale}/common.yaml`, import.meta.url), "utf8"))));
}
const tokens = (value: string) => (value.match(/{{[^}]+}}|<\/?emph>/g) ?? []).sort();
it.each(["en-US", "ko-KR", "zh-TW"])("translates shared UI keys and preserves placeholders in %s", (locale) => {
  const actual = catalog(locale);
  for (const [key, source] of catalog("zh-CN")) {
    if (key === "siteInfo.contact.content") continue; // Contacts are region-specific.
    expect(actual.has(key), key).toBe(true);
    if (source.trim()) expect(actual.get(key)?.trim(), key).toBeTruthy();
    expect(tokens(actual.get(key) ?? ""), key).toEqual(tokens(source));
  }
});
