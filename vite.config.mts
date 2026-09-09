import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Ядро собирается в dist/next/, а не в dist/ — legacy-бандл рядом остаётся
// нетронутым. rspack в tradernet копирует dist/** целиком, поэтому новый
// бандл попадает на стенд без правок его конфига.
export default defineConfig({
    build: {
        outDir: 'dist/next',
        emptyOutDir: true,
        target: 'es2020',
        lib: {
            entry: resolve(import.meta.dirname, 'core/src/index.ts'),
            name: 'IguanaChartNext',
            // umd нужен потому, что tradernet грузит график через RequireJS
            formats: ['es', 'umd'],
            fileName: (format) => `chart.${format}.js`,
        },
    },
    server: { open: '/core/demo/' },
    test: {
        include: ['core/test/**/*.test.ts'],
        environment: 'node',
    },
});
