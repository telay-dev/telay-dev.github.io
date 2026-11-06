// Installer checks use a temporary directory and never change the user's device.
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
const binary=Buffer.from('#!/bin/sh\nprintf "Telay generic\\n"\n');
const env={...process.env,PATH:shim+path.delimiter+process.env.PATH,TEST_OS:'Linux',TEST_ARCH:'x86_64'};
let mode='normal';
const requests=[];
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
    if(name==='redirected'){res.writeHead(404);res.end();return}
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
  assert.ok(failed,'the installer should reject this case');
  assert.ok(!(await readdir(temp)).includes(name),'a failed install must not create its target directory');
  assert.ok(!(await readdir(temp)).some(n=>n.startsWith('.telay-install.')),'temporary files must be removed');
}
try{
  const source=await readFile(installer,'utf8');
  assert.ok(!/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/u.test(source),'delimit shell variables before non-ASCII punctuation');
  for(const method of ['curl','wget']){
    const name=method==='curl'?"curl space 'quoted'":'wget';
    const result=await install(name,['--downloader',method]);
    assert.match(result.stdout,/Installed:/);
    const binary=path.join(temp,name,'telay');
    assert.ok((await stat(binary)).mode&0o100,'the installed binary must be executable');
    const help=await exec(binary,['--help'],{timeout:10000});
    assert.match(help.stderr,/generic/);
    assert.match(help.stderr,/Telay/);
    assert.ok(!help.stderr.includes('--site'));
    const printed=result.stdout.split('\n').find(line=>line.startsWith("'")&&line.includes(' --web '));
    assert.ok(printed);
    await exec(shell,['-c',printed+' --help'],{timeout:10000});
    const before=requests.length;
    await assert.rejects(install(name,['--downloader',method]),err=>/Directory already exists/.test(err.stderr));
    assert.equal(requests.length,before,'an existing target must be rejected before downloading');
    console.log(`PASS ${method} install, --help, command quoting, and no overwrite`);
  }
  for(const [system,arch] of [['Darwin','x86_64'],['Darwin','arm64'],['Linux','aarch64']]){
    await install(system+'-'+arch,[],{TEST_OS:system,TEST_ARCH:arch});
    console.log(`PASS platform selection ${system}/${arch}`);
  }
  await install('site-spaces',['--site',` \t${site}/  \r`]);
  await install('web-spaces',['--web',` \t${site}/  \r`]);
  console.log('PASS --web whitespace trimming and --site compatibility');
  const upstream="http://127.0.0.1:3080/?token=a'b&next=%2F";
  const complete=await install('noninteractive',['--upstream',upstream]);
  const launch=complete.stdout.split('\n').find(line=>line.startsWith("'")&&line.includes(' --upstream '));
  assert.ok(launch);
  const argv=await exec(shell,['-c',"set -- "+launch+"; printf '%s\\n' \"$@\""],{timeout:10000});
  assert.equal(argv.stdout.trim().split('\n').at(-1),upstream,'the launch command must preserve the full URL and quotes');
  assert.ok(!requests.some(url=>url.includes('token=')),'upstream credentials must not reach the download server');
  assert.match(complete.stdout,/The connector was not started/);
  console.log('PASS --upstream URL preservation, quoting, privacy, and no auto-start');
  await rejects('unknown-os',[],/supports macOS and Linux only/,{TEST_OS:'Windows_NT'});
  await rejects('unknown-arch',[],/Unsupported CPU architecture/,{TEST_ARCH:'riscv64'});
  await rejects('bad-site',['--site','https://example.com/path'],/must be an origin/);
  await rejects('bad-newline',['--site','https://example.com\ninvalid'],/must be an origin/);
  await rejects('bad-http',['--site','http://localhost:80@evil.test'],/must be an origin/);
  await rejects('bad-method',['--downloader','unknown'],/must be auto/);
  mode='corrupt';await rejects('corrupt',[],/SHA-256 mismatch/);
  mode='duplicate';await rejects('duplicate',[],/no unique valid SHA-256/);
  mode='missing';await rejects('missing',[],/checksum list/);
  mode='redirect';await rejects('redirect',['--downloader','wget'],/checksum list/);
  mode='normal';
  const defaultDir=path.join(temp,'default');await mkdir(defaultDir);
  const quotedShell="'"+shell.replaceAll("'","'\\''")+"'";
  await exec(shell,['-c',`wget -qO- '${site}/install.sh' | ${quotedShell} -s -- --web '${site}'`],{cwd:defaultDir,env,timeout:45000});
  assert.ok((await stat(path.join(defaultDir,'telay/telay'))).size>0);
  console.log('PASS wget pipe entry and default install directory');
  console.log('PASS unsupported platforms, invalid origins, damaged binaries, invalid checksums, and redirects');
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
  assert.equal(exports.startCommand(site,upstream,'windows-amd64'),`.\\telay-windows-amd64.exe --web '${site}' --upstream '${upstream.replaceAll("'","''")}'`);
  console.log('PASS POSIX and PowerShell command generation and quoting');
}finally{
  server.close();
  // Remove only the temporary directory created by this test.
  await rm(temp,{recursive:true,force:true});
}
