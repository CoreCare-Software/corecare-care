import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const publicDirectory = new URL("../public/", import.meta.url);
const htmlFiles = (await readdir(publicDirectory)).filter((name) => name.endsWith(".html"));
const pages = await Promise.all(htmlFiles.map(async (name) => ({ name, html: await readFile(new URL(name, publicDirectory), "utf8") })));

test("audited icon controls and search fields have accessible names", () => {
  for (const page of pages) {
    const iconButtons = [...page.html.matchAll(/<button(?<attrs>[^>]*)>(?<content>\s*(?:\u00d7|\u2630|\ud83d\udd14|\u2022\u2022\u2022)\s*)<\/button>/g)];
    for (const match of iconButtons) {
      assert.match(match.groups.attrs, /\baria-label=/, `${page.name} is missing an accessible name: ${match[0]}`);
    }

    const searchInputs = [...page.html.matchAll(/<input(?<attrs>[^>]*(?:type="search"|placeholder="[^"]*[Ss]earch[^"]*")[^>]*)>/g)];
    for (const match of searchInputs) {
      assert.match(match.groups.attrs, /\baria-label=/, `${page.name} is missing a search label: ${match[0]}`);
    }
  }
});

