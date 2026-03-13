/**
 * CI gate: ensures TypeCompiler.Compile() is never called inside a function body.
 * Fails with exit code 1 if violations are found.
 *
 * Pattern detected: TypeCompiler.Compile( appearing inside:
 *   - async function bodies
 *   - arrow function bodies
 *   - class method bodies
 *   - route handlers
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = new URL("../src", import.meta.url).pathname;
const VIOLATION_PATTERN = /TypeCompiler\.Compile\s*\(/;
// Matches function/class/arrow/method openings that introduce scope
const FUNCTION_SCOPE_PATTERN =
  /(?:async\s+function|function\s+\w+|=>\s*\{|async\s*\(|preHandler|preValidation|handler\s*:)/;

let violations = 0;

function walkDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full);
      continue;
    }
    if (!full.endsWith(".ts") && !full.endsWith(".tsx")) continue;

    const source = readFileSync(full, "utf-8");
    const lines = source.split("\n");

    // Simple heuristic: flag any TypeCompiler.Compile that is indented
    // (module-level calls have 0 indentation; in-function calls are indented)
    lines.forEach((line, idx) => {
      if (!VIOLATION_PATTERN.test(line)) return;
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent > 0) {
        process.stderr.write(
          `VIOLATION: ${full}:${idx + 1}\n  → TypeCompiler.Compile() must be at module level (0 indent), found at indent ${indent}\n  → ${line.trim()}\n\n`,
        );
        violations++;
      }
    });
  }
}

walkDir(SRC_DIR);

if (violations > 0) {
  process.stderr.write(
    `\n❌ ${violations} AOT compilation violation(s) found. Move TypeCompiler.Compile() calls to src/config/typebox-compiler.ts\n`,
  );
  process.exit(1);
} else {
  process.stdout.write("✅ No TypeCompiler.Compile() violations found.\n");
}
