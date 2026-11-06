import {defineConfig} from '@rsbuild/core';
import {pluginReact} from '@rsbuild/plugin-react';
import {pluginTailwindcss} from '@rsbuild/plugin-tailwindcss';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const devWasm=path.resolve(import.meta.dirname,'.cache/tailcat');

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
  server: {
    port: 5173,
    setup({action,server}) {
      if(action!=='dev')return;
      server.middlewares.use((req,res,next)=>{
        const pathname=new URL(req.url||'/', 'http://localhost').pathname;
        const name=path.basename(pathname);
        if(!pathname.startsWith('/tailcat/')||!['wasm_exec.js','main.wasm.gz'].includes(name))return next();
        try {
          res.setHeader('Cache-Control','no-cache');
          res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'application/octet-stream');
          res.end(readFileSync(path.join(devWasm,name)));
        } catch {next()}
      });
    },
  },
});
