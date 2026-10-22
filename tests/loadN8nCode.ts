import { readFileSync } from "node:fs";
import path from "node:path";

// Runs an n8n/code/*.js file exactly as the n8n Code node will (a plain script, no imports)
// and hands back the named functions, so the tests check the same text that runs in n8n.
export function loadN8nCode<T>(file: string | string[], names: (keyof T & string)[]): T {
  const files = Array.isArray(file) ? file : [file];
  const src = files.map((f) => readFileSync(path.join(process.cwd(), "n8n", "code", f), "utf8")).join("\n\n");
  return new Function(`${src}\nreturn { ${names.join(", ")} };`)() as T;
}
