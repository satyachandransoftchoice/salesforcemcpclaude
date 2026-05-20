import { CHARACTER_LIMIT } from "../config.js";

export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const truncated = text.slice(0, CHARACTER_LIMIT);
  return (
    truncated +
    `\n\n⚠️  Response truncated at ${CHARACTER_LIMIT} characters. Use pagination or narrow your query.`
  );
}

export function toJson(data: unknown): string {
  return truncate(JSON.stringify(data, null, 2));
}

export function recordsToMarkdownTable(
  records: Record<string, unknown>[]
): string {
  if (!records.length) return "_No records found._";
  const keys = Object.keys(records[0]).filter((k) => k !== "attributes");
  const header = `| ${keys.join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const rows = records.map(
    (r) =>
      `| ${keys
        .map((k) => {
          const val = r[k];
          return val === null || val === undefined
            ? ""
            : String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
        })
        .join(" | ")} |`
  );
  return truncate([header, divider, ...rows].join("\n"));
}

export function fieldsToMarkdownTable(
  fields: Array<{ name: string; label: string; type: string; updateable: boolean; createable: boolean; nillable: boolean }>
): string {
  const header = "| Name | Label | Type | Createable | Updateable | Nillable |";
  const divider = "| --- | --- | --- | --- | --- | --- |";
  const rows = fields.map(
    (f) =>
      `| ${f.name} | ${f.label} | ${f.type} | ${f.createable ? "✅" : "❌"} | ${
        f.updateable ? "✅" : "❌"
      } | ${f.nillable ? "✅" : "❌"} |`
  );
  return truncate([header, divider, ...rows].join("\n"));
}
