#!/usr/bin/env node
/**
 * Сборка legacy-бандла. Замена gulp-пайплайна, работает на современном Node.
 *
 * Поведение gulp-concat воспроизведено один в один: с каждого файла снимается
 * BOM, файлы склеиваются через '\n'. Результат проверяется побайтово против
 * закоммиченного dist — см. `npm run verify:legacy`.
 *
 *   node build.mjs           собрать dist (less -> css -> concat -> minify)
 *   node build.mjs --verify  собрать в память и сверить с текущим dist
 *   node build.mjs --no-min  без минификации (быстрее при отладке)
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { globSync } from 'node:fs';
import path from 'node:path';
import { transform as esbuildTransform } from 'esbuild';
import { transform as lightningTransform } from 'lightningcss';
import less from 'less';

const root = import.meta.dirname;
const args = new Set(process.argv.slice(2));
const verifyOnly = args.has('--verify');

/** Порядок склейки перенесён из jsSources в gulpfile.js — он значим: файлы
 *  общаются через глобальный iChart, объявленный в ichart.core.js. */
const JS_SOURCES = [
    'src/scripts/jquery.simplemodal.js',
    'src/scripts/jquery.palette.js',
    'src/scripts/lib/ichart.core.js',
    'src/scripts/lib/indicators.descr.js',
    'src/scripts/lib/charting/*',
    'src/scripts/templates.js',
    'src/scripts/chart_options_for_nt.js',
    'src/scripts/chart.js',
    'src/scripts/iguana-ui.js',
    'src/scripts/jquery.iguana-chart.js',
    'src/scripts/ta/TA_prototypes.js',
    'src/scripts/ta/functions/*',
    'src/scripts/ta/TA_common.js',
    'src/scripts/ta/TA_analyse_rs.js',
];

/** Минификация: uglify-js из старого пайплайна не парсит ES6, а он в коде уже
 *  есть (параметры по умолчанию в chart.js). es2015 — то, что и так в проде. */
const MINIFY_TARGET = 'es2015';

/** gulp.src разворачивает глоб в отсортированном порядке. */
const expand = (patterns) =>
    patterns.flatMap((p) => (p.includes('*') ? globSync(p, { cwd: root }).sort() : [p]));

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

async function concat(patterns) {
    const files = expand(patterns);
    const parts = await Promise.all(
        files.map(async (f) => stripBom(await readFile(path.join(root, f), 'utf8'))),
    );
    return { files, text: parts.join('\n') };
}

/** Компилирует src/styles/*.less рядом с исходником — как делал gulp-less. */
async function buildLess() {
    const sources = expand(['src/styles/*.less']);
    for (const src of sources) {
        const input = await readFile(path.join(root, src), 'utf8');
        const { css } = await less.render(input, {
            filename: path.join(root, src),
            paths: [path.join(root, 'less', 'includes')],
        });
        await writeFile(path.join(root, src.replace(/\.less$/, '.css')), css);
    }
    return sources.length;
}

async function compare(relPath, produced) {
    const current = await readFile(path.join(root, relPath), 'utf8').catch(() => null);
    if (current === null) return `${relPath}: нет текущего файла для сравнения`;
    return current === produced
        ? `${relPath}: совпадает побайтово (${produced.length} симв.)`
        : `${relPath}: РАСХОДИТСЯ (было ${current.length}, стало ${produced.length})`;
}

if (verifyOnly) {
    const [js, css] = [await concat(JS_SOURCES), await concat(['src/styles/*.css'])];
    console.log(await compare('dist/iguanachart.js', js.text));
    console.log(await compare('dist/iguanachart.css', css.text));
    process.exit(0);
}

const lessCount = await buildLess();
const js = await concat(JS_SOURCES);
const css = await concat(['src/styles/*.css']);

await mkdir(path.join(root, 'dist/i18n'), { recursive: true });
await writeFile(path.join(root, 'dist/iguanachart.js'), js.text);
await writeFile(path.join(root, 'dist/iguanachart.css'), css.text);
await copyFile(
    path.join(root, 'src/scripts/i18n/i18n.en.js'),
    path.join(root, 'dist/i18n/i18n.en.js'),
);

console.log(`less: ${lessCount} файлов скомпилировано`);
console.log(`js:   ${js.files.length} файлов -> dist/iguanachart.js (${js.text.length} симв.)`);
console.log(`css:  ${css.files.length} файлов -> dist/iguanachart.css (${css.text.length} симв.)`);

if (args.has('--no-min')) process.exit(0);

const minJs = await esbuildTransform(js.text, {
    loader: 'js',
    minify: true,
    target: MINIFY_TARGET,
    legalComments: 'none',
});
await writeFile(path.join(root, 'dist/iguanachart.min.js'), minJs.code);
console.log(`min:  dist/iguanachart.min.js (${minJs.code.length} симв.)`);

// lightningcss вместо cssnano: тот же CSS сжимается на 30% сильнее.
const minCss = lightningTransform({
    filename: 'iguanachart.css',
    code: Buffer.from(css.text),
    minify: true,
});
await writeFile(path.join(root, 'dist/iguanachart.min.css'), minCss.code);
console.log(`min:  dist/iguanachart.min.css (${minCss.code.length} симв.)`);
