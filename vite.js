import { defineConfig } from '@adonisjs/vite';
const viteBackendConfig = defineConfig({
    buildDirectory: 'public/vite',
    manifestFile: 'public/vite/.vite/manifest.json',
    assetsUrl: '/vite',
    scriptAttributes: {
        defer: true,
    },
});
export default viteBackendConfig;
//# sourceMappingURL=vite.js.map