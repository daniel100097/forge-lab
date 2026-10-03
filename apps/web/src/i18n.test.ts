import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relativeDate, setLanguage, uiLanguage } from "./i18n";

const root = join(__dirname, "locales");
const flatten = (value: unknown, prefix = ""): Record<string, string> =>
  value && typeof value === "object"
    ? Object.assign(
        {},
        ...Object.entries(value).map(([key, child]) =>
          flatten(child, prefix ? `${prefix}.${key}` : key),
        ),
      )
    : { [prefix]: String(value) };
const catalog = (language: string, file: string) =>
  flatten(JSON.parse(readFileSync(join(root, language, file), "utf8")));
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}|<(\w+)\/?>/g)]
    .map((match) => match[1] ?? `<${match[2]}>`)
    .sort();

describe("translation catalogs", () => {
  const files = readdirSync(join(root, "en"));
  for (const language of readdirSync(root).filter((name) => name !== "en")) {
    for (const file of files) {
      it(`${language}/${file} has every English key and placeholder`, () => {
        const english = catalog("en", file);
        const translated = catalog(language, file);
        expect(Object.keys(translated).sort()).toEqual(
          Object.keys(english).sort(),
        );
        for (const [key, text] of Object.entries(english)) {
          expect(placeholders(translated[key]), `${file}: ${key}`).toEqual(
            placeholders(text),
          );
          expect(translated[key].trim(), `${file}: ${key}`).not.toBe("");
        }
      });
    }
  }
});

describe("language selection", () => {
  it("maps Forgejo locales to UI languages", () => {
    expect(uiLanguage("de-DE")).toBe("de");
    expect(uiLanguage("en-US")).toBe("en");
    expect(uiLanguage("fr-FR")).toBe("en");
    expect(uiLanguage(undefined)).toBe("en");
  });
  it("formats relative dates in the active language", async () => {
    const yesterday = new Date(Date.now() - 86400000 * 1.5).toISOString();
    await setLanguage("en-US");
    expect(relativeDate(new Date().toISOString())).toBe("today");
    expect(relativeDate(yesterday)).toBe("yesterday");
    await setLanguage("de-DE");
    expect(relativeDate(yesterday)).toBe("gestern");
    await setLanguage("en");
  });
});
