// 安装器验收：仅向临时目录写入，不启动中继或模型、不修改用户设备。
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';

const exec=promisify(execFile);
const root=path.resolve(import.meta.dirname,'..');
const installer=path.join(root,'public/install.sh');
const shell=process.env.RELAY_TEST_SHELL||'sh';
const temp=await mkdtemp(path.join(os.tmpdir(),'relay-install-test-'));
const shim=path.join(temp,'shim');
await mkdir(shim);
await writeFile(path.join(shim,'uname'),'#!/bin/sh\ncase "$1" in -s) printf "%s\\n" "$TEST_OS" ;; -m) printf "%s\\n" "$TEST_ARCH" ;; esac\n',{mode:0o700});
const env={...process.env,PATH:shim+path.delimiter+process.env.PATH,TEST_OS:'Linux',TEST_ARCH:'x86_64'};
let mode='normal';
const requests=[];
const binary=Buffer.from('#!/bin/sh\nprintf "Telay generic\\n"\n');
const names=['telay-darwin-amd64','telay-darwin-arm64','telay-linux-amd64','telay-linux-arm64','telay-windows-amd64.exe'];
const sums=names.map(name=>`${createHash('sha256').update(binary).digest('hex')}  ${name}`).join('\n')+'\n';
const server=createServer(async(req,res)=>{
  requests.push(req.url);
  try{
    const name=req.url.split('/').pop();
    if(!/^([a-zA-Z0-9_.-]+)$/.test(name))throw new Error('bad path');
    if(mode==='missing'&&name==='SHA256SUMS'){res.writeHead(404);res.end();return}
    if(name==='SHA256SUMS'){res.end(mode==='duplicate'?sums+sums:sums);return}
    if(mode==='corrupt'&&name.startsWith('telay-')){res.end('damaged download');return}
    if(mode==='redirect'&&name==='SHA256SUMS'){res.writeHead(302,{Location:'/redirected'});res.end();return}
    const data=name==='install.sh'?await readFile(installer):binary;
    res.end(data);
  }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const site=`http://127.0.0.1:${server.address().port}`;
async function install(name,args=[],extraEnv={}){
  return exec(shell,[installer,'--web',site,'--dir',path.join(temp,name),...args],{env:{...env,TELAY_DOWNLOADS:`${site}/downloads`,...extraEnv},timeout:45000,maxBuffer:1024*1024});
}
async function rejects(name,args,message,extraEnv={}){
  let failed=false;
  try{await install(name,args,extraEnv)}catch(err){assert.notEqual(err.code,0);assert.match(err.stderr,message);failed=true}
  assert.ok(failed,'应拒绝此安装');
  assert.ok(!(await readdir(temp)).includes(name),'失败时不得产生安装目录');
  assert.ok(!(await readdir(temp)).some(n=>n.startsWith('.telay-install.')),'临时文件应清理');
}
try{
  const source=await readFile(installer,'utf8');
  assert.ok(!/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/u.test(source),'变量名紧贴非 ASCII 字符时须使用 ${name}');
  for(const method of ['curl','wget']){
    const name=method==='curl'?"curl space 'quoted'":'wget';
    const result=await install(name,['--downloader',method]);
    assert.match(result.stdout,/安装完成/);
    const binary=path.join(temp,name,'telay');
    assert.ok((await stat(binary)).mode&0o100,'二进制应可执行');
    const help=await exec(binary,['--help'],{timeout:10000});
    assert.match(help.stderr,/generic/);
    assert.match(help.stderr,/Telay/);
    assert.ok(!help.stderr.includes('--site'));
    const printed=result.stdout.split('\n').find(line=>line.startsWith("'")&&line.includes(' --web '));
    assert.ok(printed);
    await exec(shell,['-c',printed+' --help'],{timeout:10000});
    const before=requests.length;
    await assert.rejects(install(name,['--downloader',method]),err=>/目录已存在，未覆盖/.test(err.stderr));
    assert.equal(requests.length,before,'已有目录时不应下载');
    console.log(`PASS ${method} 实际安装、--help、命令转义与不覆盖`);
  }
  for(const [system,arch] of [['Darwin','x86_64'],['Darwin','arm64'],['Linux','aarch64']]){
    await install(system+'-'+arch,[],{TEST_OS:system,TEST_ARCH:arch});
    console.log(`PASS 平台选择 ${system}/${arch}`);
  }
  await install('site-spaces',['--site',` \t${site}/  \r`]);
  await install('web-spaces',['--web',` \t${site}/  \r`]);
  console.log('PASS --web 空白清理、旧 --site 兼容');
  const upstream="http://127.0.0.1:3080/?token=a'b&next=%2F";
  const complete=await install('noninteractive',['--upstream',upstream]);
  const launch=complete.stdout.split('\n').find(line=>line.startsWith("'")&&line.includes(' --upstream '));
  assert.ok(launch);
  const argv=await exec(shell,['-c',"set -- "+launch+"; printf '%s\\n' \"$@\""],{timeout:10000});
  assert.equal(argv.stdout.trim().split('\n').at(-1),upstream,'启动命令完整保留 token 和单引号');
  assert.ok(!requests.some(url=>url.includes('token=')),'上游秘密不上传下载站点');
  assert.match(complete.stdout,/未启动连接器/);
  console.log('PASS --upstream 完整 URL、转义、不上传、不自动启动');
  await rejects('unknown-os',[],/仅支持 macOS/,{TEST_OS:'Windows_NT'});
  await rejects('unknown-arch',[],/不支持此 CPU 架构/,{TEST_ARCH:'riscv64'});
  await rejects('bad-site',['--site','https://example.com/path'],/只能是站点 origin/);
  await rejects('bad-newline',['--site','https://example.com\ninvalid'],/只能是站点 origin/);
  await rejects('bad-http',['--site','http://localhost:80@evil.test'],/只能是站点 origin/);
  await rejects('bad-method',['--downloader','unknown'],/仅支持 auto/);
  mode='corrupt';await rejects('corrupt',[],/SHA-256 不一致/);
  mode='duplicate';await rejects('duplicate',[],/唯一的平台 SHA-256/);
  mode='missing';await rejects('missing',[],/校验清单下载失败/);
  mode='redirect';await rejects('redirect',['--downloader','wget'],/校验清单下载失败/);
  mode='normal';
  const defaultDir=path.join(temp,'default');await mkdir(defaultDir);
  const quotedShell="'"+shell.replaceAll("'","'\\''")+"'";
  await exec(shell,['-c',`wget -qO- '${site}/install.sh' | ${quotedShell} -s -- --web '${site}'`],{cwd:defaultDir,env,timeout:45000});
  assert.ok((await stat(path.join(defaultDir,'telay/telay'))).size>0);
  console.log('PASS wget 管道入口与默认安装路径');
  console.log('PASS 不支持平台、坏地址、损坏包、缺失/重复清单及重定向拒绝');
  console.log(`PASS shell=${shell} locale=${env.LC_ALL||'default'}`);
  const exports={};
  vm.runInNewContext(ts.transpileModule(await readFile(path.join(root,'src/commands.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports});
  for(const method of ['wget','curl']) {
    assert.ok(exports.installCommand(site,method).includes(' --web '));
    assert.ok(!exports.installCommand(site,method).includes(' --site '));
  }
  const command=exports.startCommand(site,upstream);
  const extracted=await exec(shell,['-c',"set -- "+command+"; printf '%s\\n' \"$@\""],{timeout:10000});
  assert.deepEqual(extracted.stdout.trim().split('\n'),['./telay/telay','--web',site,'--upstream',upstream]);
  assert.equal(exports.startCommand(site,upstream,'windows-amd64.exe'),`.\\telay-windows-amd64.exe --web '${site}' --upstream '${upstream.replaceAll("'","''")}'`);
  console.log('PASS 网页生成 POSIX/PowerShell 双 URL 命令与转义');
}finally{
  server.close();
  // 精确删除本测试 mkdtemp 创建的目录，不涉及项目或用户目录。
  await rm(temp,{recursive:true,force:true});
}
