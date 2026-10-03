import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parse, stringify } from "yaml";
import { CopyButton } from "./UI";

// Native file view: CITATION.cff and CITATION.bib get a switch between the
// original file and the other format (citation-information web component).

type Person = Record<string, unknown>;
type Cff = Record<string, unknown>;

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

function personName(person: Person) {
  if (text(person.name)) return `{${text(person.name)}}`;
  const family = [text(person["name-particle"]), text(person["family-names"])]
    .filter(Boolean)
    .join(" ");
  const given = text(person["given-names"]);
  const suffix = text(person["name-suffix"]);
  return [family, suffix, given].filter(Boolean).join(", ");
}

/** CFF (YAML) to a BibTeX entry, following citation-js' field mapping. */
export function cffToBibtex(source: string) {
  const cff = parse(source) as Cff;
  if (!cff || typeof cff !== "object") throw new Error("Invalid CFF");
  const work = (
    cff["preferred-citation"] && typeof cff["preferred-citation"] === "object"
      ? cff["preferred-citation"]
      : cff
  ) as Cff;
  const type = text(work.type) || "software";
  const bibType =
    {
      article: "article",
      book: "book",
      "conference-paper": "inproceedings",
      proceedings: "proceedings",
      report: "techreport",
      thesis: "phdthesis",
      manual: "manual",
      software: "software",
      "software-code": "software",
      dataset: "dataset",
    }[type] ?? "misc";
  const authors = (Array.isArray(work.authors) ? work.authors : []) as Person[];
  const date = text(work["date-released"] || work["date-published"]);
  const match = date.match(/^(\d{4})(?:-(\d{2}))?/);
  const year = text(work.year) || match?.[1] || "";
  const month = match?.[2] ? months[Number(match[2]) - 1] : "";
  const title = text(work.title);
  const firstAuthor = authors[0]
    ? text(authors[0]["family-names"]) || text(authors[0].name)
    : "";
  const key =
    [firstAuthor, ...title.split(/\s+/).filter(Boolean).slice(0, 3), year]
      .filter(Boolean)
      .join("_")
      .replace(/[^\w-]+/g, "") || "citation";
  const fields: [string, string][] = [];
  const add = (name: string, value: string, raw = false) => {
    if (value) fields.push([name, raw ? value : `{${value}}`]);
  };
  add("author", authors.map(personName).filter(Boolean).join(" and "));
  add("doi", text(work.doi));
  add("journal", text(work.journal));
  add("license", text(work.license));
  add("month", month, true);
  // citation-js keeps the title's capitalization with double braces.
  add("title", title ? `{${title}}` : "");
  add("url", text(work.url) || text(work["repository-code"]));
  add("version", text(work.version));
  add("year", year);
  fields.sort(([a], [b]) => a.localeCompare(b));
  return `@${bibType}{${key},\n${fields
    .map(([name, value]) => `${name} = ${value}`)
    .join(",\n")}\n}`;
}

function bibFields(entry: string) {
  const fields: Record<string, string> = {};
  const body = entry.slice(entry.indexOf(",") + 1);
  const pattern = /(\w[\w-]*)\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    let index = pattern.lastIndex;
    let value = "";
    if (body[index] === "{") {
      let depth = 0;
      for (; index < body.length; index++) {
        if (body[index] === "{") depth++;
        else if (body[index] === "}" && --depth === 0) break;
        value += body[index];
      }
      value = value.slice(1);
      index++;
    } else if (body[index] === '"') {
      const end = body.indexOf('"', index + 1);
      value = body.slice(index + 1, end);
      index = end + 1;
    } else {
      const end = body.slice(index).search(/[,}\n]/);
      value = body.slice(index, end < 0 ? undefined : index + end).trim();
      index += Math.max(0, end);
    }
    fields[match[1].toLowerCase()] = value.replace(/[{}]/g, "").trim();
    pattern.lastIndex = index;
  }
  return fields;
}

/** The first BibTeX entry as Citation File Format. */
export function bibtexToCff(source: string) {
  const start = source.indexOf("@");
  if (start < 0) throw new Error("Invalid BibTeX");
  const fields = bibFields(source.slice(start));
  const cff: Cff = {
    "cff-version": "1.2.0",
    message: "If you use this software, please cite it as below.",
  };
  if (fields.title) cff.title = fields.title;
  const authors = (fields.author || "")
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.includes(",")) {
        const [family, given] = name.split(",", 2).map((part) => part.trim());
        return { "family-names": family, "given-names": given };
      }
      const parts = name.split(/\s+/);
      return parts.length > 1
        ? {
            "family-names": parts.at(-1),
            "given-names": parts.slice(0, -1).join(" "),
          }
        : { name };
    });
  if (authors.length) cff.authors = authors;
  if (fields.version) cff.version = fields.version;
  if (fields.doi) cff.doi = fields.doi;
  if (fields.url) cff.url = fields.url;
  if (fields.year) {
    const month = months.indexOf(
      (fields.month || "").slice(0, 3).toLowerCase(),
    );
    cff["date-released"] =
      month >= 0
        ? `${fields.year}-${String(month + 1).padStart(2, "0")}-01`
        : fields.year;
  }
  if (fields.license) cff.license = fields.license;
  return stringify(cff).trim();
}

/** The converted form of a citation file, or an error message. */
export function useCitation(filename: string, content: string) {
  return useMemo(() => {
    const bib = /\.bib$/i.test(filename);
    try {
      return {
        original: bib ? "BibTeX" : "CFF",
        other: bib ? "CFF" : "BibTeX",
        text: bib ? bibtexToCff(content) : cffToBibtex(content),
        error: "",
      };
    } catch (error) {
      return {
        original: bib ? "BibTeX" : "CFF",
        other: bib ? "CFF" : "BibTeX",
        text: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [filename, content]);
}

export function CitationOutput({
  value,
  error,
  format,
}: {
  value: string;
  error: string;
  format: string;
}) {
  const { t } = useTranslation("repository");
  if (error)
    return (
      <div className="m-4 rounded border border-[#e9be74] bg-[#fdf1dd] p-3 text-sm text-[#8f4700] dark:border-[#8f5d0b] dark:bg-[#4a3a1c] dark:text-[#e9c77b]">
        <strong className="block">
          {t("citation.parseError", { format })}
        </strong>
        <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  return (
    <div className="relative">
      <div className="absolute top-2 right-2">
        <CopyButton value={value} label={t("citation.copy", { format })} />
      </div>
      <pre className="citation-output overflow-auto p-4 pr-40 font-mono text-[13px] leading-6 whitespace-pre max-md:pt-14 max-md:pr-4">
        {value}
      </pre>
    </div>
  );
}
