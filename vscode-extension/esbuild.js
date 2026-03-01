const esbuild = require('esbuild');
const { globSync } = require('glob');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
    const testEntryPoints = globSync([
        'src/test/suite/index.ts',
        'src/test/suite/**/*.ts',
        'src/test/ui/**/*.ts',
        'src/test/supervisor/**/*.ts',
        'src/test/runTest.ts',
    ], {
        windowsPathsNoEscape: true,
        ignore: [
            '**/*.d.ts',
            'src/test/suite/chat-phase1-buttons.test.ts',
            'src/test/suite/chat-followups-host.test.ts',
            'src/test/suite/spawn-serialization.test.ts',
        ],
    });

    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts', ...testEntryPoints],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outbase: 'src',
        outdir: 'out',
        external: ['vscode'],
        logLevel: 'info',
    });

    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
