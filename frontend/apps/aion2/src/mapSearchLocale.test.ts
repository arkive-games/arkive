/// <reference types="node" />
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { createInstance } from "i18next";
import { expect, it } from "vitest";

it.each(["en-US", "zh-CN", "zh-TW", "ko-KR"])("ships search and category actions without fallback in %s", async (lng) => {
  const common = parse(readFileSync(new URL(`../public/locales/${lng}/common.yaml`, import.meta.url), "utf8"));
  const i18n = createInstance();
  await i18n.init({ lng, fallbackLng: false, resources: { [lng]: { common } }, defaultNS: "common" });
  for (const key of ["markerSearch.placeholder", "menu.showCategory", "menu.hideCategory", "globalSearch.empty", "ui.search"]) {
    expect(i18n.exists(key), key).toBe(true);
  }
  expect(i18n.t("markerSearch.placeholder")).not.toBe(i18n.t("globalSearch.placeholder"));
  if (lng === "en-US") {
    expect(i18n.t("search.resultsCount", { count: 1 })).toBe("1 result");
    expect(i18n.t("search.resultsCount", { count: 2 })).toBe("2 results");
  }
});
