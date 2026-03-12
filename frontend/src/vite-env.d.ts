// vite-env.d.ts
// Minimal ImportMeta type declarations for Vite's import.meta.env.
// The full version comes from `vite/client` — declared here since vite is a
// transitive dep via vinxi and not a direct devDependency.

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_APP_VERSION?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
