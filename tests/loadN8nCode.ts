import { readFileSync } from "node:fs";
import path from "node:path";

// Runs an n8n/code/*.js file exactly as the n8n Code node will (a plain script, no imports)
// and hands back the named functions, so the tests check the same text that runs in n8n.
export function loadN8nCode<T>(file: string, names: (keyof T & string)[]): T {
  const src = readFileSync(path.join(process.cwd(), "n8n", "code", file), "utf8");
  return new Function(`${src}\nreturn { ${names.join(", ")} };`)() as T;
}
