import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Explain This",
  version: pkg.version,
  description: pkg.description,
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png"
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  permissions: ["contextMenus", "offscreen", "storage"],
  host_permissions: ["<all_urls>"],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_icon: "public/icons/icon48.png"
  },
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://huggingface.co https://raw.githubusercontent.com https://cdn.jsdelivr.net;"
  }
});
