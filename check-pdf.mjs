import { createRequire } from "module";
const requireCjs = createRequire(import.meta.url);
const m = requireCjs("pdf-parse");
console.log("typeof m:", typeof m);
console.log("keys:", Object.keys(m));
console.log("typeof m.default:", typeof m.default);