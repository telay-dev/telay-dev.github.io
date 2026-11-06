import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync,unlinkSync,readFileSync,copyFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const engineVersion=createHash('sha256').update(readFileSync(resolve('public/tailcat/main.wasm.gz'))).update(readFileSync(resolve('public/tailcat/wasm_exec.js'))).digest('hex');
const bridgeVersion=createHash('sha256').update(readFileSync(resolve('public/bridge-sw.js'))).update(readFileSync(resolve('public/__relay/http-response.js'))).digest('hex');
export default defineConfig({define:{__RELAY_ENGINE_PATH__:JSON.stringify('/tailcat/'+engineVersion),__RELAY_BRIDGE_VERSION__:JSON.stringify(bridgeVersion)},plugins:[react(),{
  name:'version-connection-engine',
  configureServer(server){server.middlewares.use((req,_res,next)=>{if(req.url?.startsWith('/tailcat/'+engineVersion+'/'))req.url=req.url.replace('/tailcat/'+engineVersion+'/', '/tailcat/');next()})},
  closeBundle(){
    const target=resolve('dist/tailcat',engineVersion);mkdirSync(target,{recursive:true});
    for(const name of ['main.wasm.gz','wasm_exec.js'])copyFileSync(resolve('public/tailcat',name),resolve(target,name));
    // 正常的 HTTP 头配置；预览平台不一定读取 _headers，不能伪称已生效。
    writeFileSync(resolve('dist/_headers'),`/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/__relay/index.html\n  Cache-Control: no-cache\n/bridge-sw.js\n  Cache-Control: no-cache\n/__relay/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/tailcat/${engineVersion}/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
    for(const name of ['main.wasm','main.wasm.zst','main.wasm.gz','wasm_exec.js','app.js','index.html']){const file=resolve('dist/tailcat',name);if(existsSync(file))unlinkSync(file)}
    // 只剔除生成目录内的旧品牌包，不改动原项目或旧发布文件。
    for(const name of ['dsh-remote-darwin-amd64.zip','dsh-remote-darwin-arm64.zip','dsh-remote-linux-amd64.zip','dsh-remote-linux-arm64.zip','dsh-remote-windows-amd64.exe.zip','connector-source.zip']){
      const file=resolve('dist/downloads',name);if(existsSync(file))unlinkSync(file);
    }
  }
}],server:{port:5173},build:{assetsDir:'__relay/assets',rollupOptions:{input:{main:'index.html',standalone:'__relay/index.html'}}}});
