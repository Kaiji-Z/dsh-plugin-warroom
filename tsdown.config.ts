import { defineConfig } from 'tsdown'

// Host half: plain ESM with runtime peers external.
const host = defineConfig({
  name: 'dsh-plugin-warroom',
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  outDir: 'lib',
  clean: false,
  external: [/^@deepseek-ai\//, /^react$/],
})

// Browser half: the dsh client-bundle contract — CJS wrapped in
// window.__ModuleLoader__.load({ id, factory }); the shell's frozen module
// table answers the injected require for platform modules (react).
const client = defineConfig({
  name: 'dsh-plugin-warroom/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', '@deepseek-ai/dsh-client-runtime/client'],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: "dsh-plugin-warroom", factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})

export default [host, client]
