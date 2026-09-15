import { defineConfig } from 'vite';
import adonisjs from '@adonisjs/vite/client';
export default defineConfig({
    plugins: [
        adonisjs({
            buildDirectory: 'public/vite',
            assetsUrl: '/vite',
            entryPoints: ['resources/css/app.css', 'resources/js/app.js'],
            reload: ['resources/views/**/*.edge'],
        }),
    ],
    build: {
        emptyOutDir: false,
    },
    server: {
        watch: {
            ignored: ['**/storage/**', '**/tmp/**'],
        },
    },
});
//# sourceMappingURL=vite.config.js.map