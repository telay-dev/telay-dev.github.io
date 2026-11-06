import {mkdirSync,readdirSync,readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'public/downloads');
mkdirSync(output,{recursive:true});
const binaries=['telay-darwin-amd64','telay-darwin-arm64','telay-linux-amd64','telay-linux-arm64','telay-windows-amd64.exe'];
for(const name of binaries)copyFileSync(path.join(root,'release',name),path.join(output,name));
copyFileSync(path.join(root,'connector/THIRD_PARTY_NOTICES.txt'),path.join(output,'THIRD_PARTY_NOTICES.txt'));

const licenses=[];
function collect(directory,base=directory){
  for(const item of readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isDirectory())collect(file,base);
    else if(/^(license|copying|notice)(\.|$)/i.test(item.name))licenses.push(`\n\n===== ${path.relative(base,file)} =====\n\n${readFileSync(file,'utf8')}`);
  }
}
collect(path.join(root,'connector/vendor'));
for(const name of ['react','react-dom','lucide-react','tailwindcss','http-cache-semantics'])collect(path.join(root,'node_modules',name));
writeFileSync(path.join(output,'THIRD_PARTY_LICENSES.txt'),licenses.join(''));

const files=[...binaries,'THIRD_PARTY_NOTICES.txt','THIRD_PARTY_LICENSES.txt'];
const checksums=files.sort().map(name=>`${createHash('sha256').update(readFileSync(path.join(output,name))).digest('hex')}  ${name}`);
writeFileSync(path.join(output,'SHA256SUMS'),checksums.join('\n')+'\n');
