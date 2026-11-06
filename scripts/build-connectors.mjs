// 使用项目要求的 Go 工具链构建全部下载包。
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
const run=promisify(execFile);
const root=path.resolve(import.meta.dirname,'..');
mkdirSync(path.join(root,'release'),{recursive:true});
const targets=[['darwin','amd64'],['darwin','arm64'],['linux','amd64'],['linux','arm64'],['windows','amd64']];
await Promise.all(targets.map(async([os,arch])=>{
  const name=`telay-${os}-${arch}${os==='windows'?'.exe':''}`;
  await run(process.env.RELAY_GO||'go',['build','-trimpath','-ldflags=-s -w','-o',path.join(root,'release',name),'.'],
    {cwd:path.join(root,'connector'),env:{...process.env,CGO_ENABLED:'0',GOOS:os,GOARCH:arch},maxBuffer:1024*1024});
  console.log(`已构建 ${name}`);
}));
