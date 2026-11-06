import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const run=promisify(execFile);
const root=path.resolve(import.meta.dirname,'..');
const connector=path.join(root,'connector');
const output=path.join(root,'public/downloads');
const binaries=['telay-darwin-amd64','telay-darwin-arm64','telay-linux-amd64','telay-linux-arm64','telay-windows-amd64.exe'];

await run(process.env.RELAY_GO||'go',['mod','vendor'],{cwd:connector});
mkdirSync(path.join(root,'release'),{recursive:true});
await Promise.all([['darwin','amd64'],['darwin','arm64'],['linux','amd64'],['linux','arm64'],['windows','amd64']].map(async([os,arch])=>{
  const name=`telay-${os}-${arch}${os==='windows'?'.exe':''}`;
  await run(process.env.RELAY_GO||'go',['build','-trimpath','-ldflags=-s -w','-o',path.join(root,'release',name),'.'],
    {cwd:connector,env:{...process.env,CGO_ENABLED:'0',GOOS:os,GOARCH:arch},maxBuffer:1024*1024});
}));

mkdirSync(output,{recursive:true});
for(const name of binaries)copyFileSync(path.join(root,'release',name),path.join(output,name));
const licenses=[];
function collect(directory,base=directory){
  for(const item of readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isDirectory())collect(file,base);
    else if(/^(license|copying|notice)(\.|$)/i.test(item.name))licenses.push(`\n\n===== ${path.relative(base,file)} =====\n\n${readFileSync(file,'utf8')}`);
  }
}
collect(path.join(connector,'vendor'));
for(const name of ['react','react-dom','lucide-react','tailwindcss','http-cache-semantics'])collect(path.join(root,'node_modules',name));
writeFileSync(path.join(output,'THIRD_PARTY_LICENSES.txt'),licenses.join(''));

const files=[...binaries,'THIRD_PARTY_NOTICES.txt','THIRD_PARTY_LICENSES.txt'];
const checksums=files.sort().map(name=>`${createHash('sha256').update(readFileSync(path.join(output,name))).digest('hex')}  ${name}`);
writeFileSync(path.join(output,'SHA256SUMS'),checksums.join('\n')+'\n');
