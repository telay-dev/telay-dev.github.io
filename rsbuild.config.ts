import {defineConfig} from '@rsbuild/core';
import {pluginReact} from '@rsbuild/plugin-react';
import {pluginTailwindcss} from '@rsbuild/plugin-tailwindcss';

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: {
      index: './src/main.tsx',
      standalone: './src/standalone-entry.ts',
    },
  },
  html: {
    title: 'Telay · Connect a device',
  },
  tools: {
    htmlPlugin(config, {entryName}) {
      const standalone = entryName === 'standalone';
      config.template = standalone ? './src/standalone.html' : './index.html';
      config.filename = standalone ? '__relay/index.html' : 'index.html';
    },
  },
  server: {port: 5173},
});
