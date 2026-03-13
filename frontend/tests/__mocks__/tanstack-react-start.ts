/**
 * Vitest stub for @tanstack/react-start
 * createServerFn returns a chainable object; the final .handler() call
 * returns the handler function itself so contract tests can invoke it directly.
 */

function createServerFn(_opts?: unknown) {
  const chain = {
    validator: (_v: unknown) => chain,
    middleware: (_m: unknown) => chain,
    handler: (fn: unknown) => fn,
  };
  return chain;
}

export { createServerFn };
