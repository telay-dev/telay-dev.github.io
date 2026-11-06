// 机械打包：原文件和第三方许可逐字复制，不修改第三方源码。
import {mkdirSync,mkdtempSync,copyFileSync,readdirSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'public/downloads');
mkdirSync(out,{recursive:true});
const bundle=path.join(root,'release/telay-bundle');mkdirSync(bundle,{recursive:true});
copyFileSync(path.join(root,'connector/README.md'),path.join(bundle,'README.md'));
copyFileSync(path.join(root,'connector/THIRD_PARTY_NOTICES.txt'),path.join(bundle,'THIRD_PARTY_NOTICES.txt'));
const licenses=path.join(bundle,'licenses');mkdirSync(licenses,{recursive:true});
function collect(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())collect(p);else if(/license|copying|notice/i.test(item.name)){const dest=path.join(licenses,path.relative(path.join(root,'connector/vendor'),p));mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(p,dest)}}}
collect(path.join(root,'connector/vendor'));
for(const pkg of ['react','react-dom','lucide-react','tailwindcss','http-cache-semantics']){const dir=path.join(root,'node_modules',pkg);for(const name of readdirSync(dir))if(/license/i.test(name))copyFileSync(path.join(dir,name),path.join(licenses,pkg+'-'+name))}
execFileSync('zip',['-qr',path.join(bundle,'THIRD_PARTY_LICENSES.zip'),'licenses'],{cwd:bundle});
copyFileSync(path.join(bundle,'THIRD_PARTY_NOTICES.txt'),path.join(out,'THIRD_PARTY_NOTICES.txt'));
copyFileSync(path.join(bundle,'THIRD_PARTY_LICENSES.zip'),path.join(out,'THIRD_PARTY_LICENSES.zip'));
const binaries=['telay-darwin-amd64','telay-darwin-arm64','telay-linux-amd64','telay-linux-arm64','telay-windows-amd64.exe'];
for(const name of binaries){
 copyFileSync(path.join(root,'release',name),path.join(bundle,name));
 execFileSync('zip',['-q',path.join(out,name+'.zip'),name,'README.md','THIRD_PARTY_NOTICES.txt','THIRD_PARTY_LICENSES.zip'],{cwd:bundle});
}
const src=mkdtempSync(path.join(root,'release/source-'));
cpSync(path.join(root,'connector'),path.join(src,'connector'),{recursive:true,filter:p=>!path.basename(p).startsWith('dsh-remote')&&!['telay','telay.exe'].includes(path.basename(p))});
for(const name of ['src','scripts','__relay','docs','browser-source'])cpSync(path.join(root,name),path.join(src,name),{recursive:true});
for(const name of ['README.md','LICENSE','.gitignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','index.html','tsconfig.json','vite.config.ts','postcss.config.js','tailwind.config.js'])copyFileSync(path.join(root,name),path.join(src,name));
mkdirSync(path.join(src,'public/tailcat'),{recursive:true});
mkdirSync(path.join(src,'public/downloads'),{recursive:true});
for(const name of ['bridge-sw.js','__relay','favicon.svg','install.sh'])cpSync(path.join(root,'public',name),path.join(src,'public',name),{recursive:true});
for(const name of ['main.wasm.gz','wasm_exec.js'])copyFileSync(path.join(root,'public/tailcat',name),path.join(src,'public/tailcat',name));
for(const name of ['THIRD_PARTY_NOTICES.txt','THIRD_PARTY_LICENSES.zip'])copyFileSync(path.join(out,name),path.join(src,'public/downloads',name));
execFileSync('zip',['-qrFS',path.join(out,'telay-source.zip'),'.'],{cwd:src});
const sums=[...binaries.map(name=>name+'.zip'),'telay-source.zip','THIRD_PARTY_LICENSES.zip','THIRD_PARTY_NOTICES.txt'].sort().map(name=>{
 const hash=createHash('sha256').update(readFileSync(path.join(out,name))).digest('hex');
 return `${hash}  ${name}`;
});
writeFileSync(path.join(out,'SHA256SUMS'),sums.join('\n')+'\n');
console.log('Packaged binaries, source, original third-party licenses, and SHA256SUMS.');
