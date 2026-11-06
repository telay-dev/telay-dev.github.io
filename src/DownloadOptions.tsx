import {t} from './i18n';

const downloads='https://raw.githubusercontent.com/GitaiQAQ/telay/main/public/downloads';

// Apple 图标来自 Simple Icons（CC0）；其余为朴素的系统识别符号。
function PlatformIcon({system}:{system:'macOS'|'Windows'|'Linux'}) {
  if(system==='macOS')return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>;
  if(system==='Windows')return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17C4 13 8 11 8 7a4 4 0 0 1 8 0c0 4 4 6 1 10M8 17l-4 4h6l2-2 2 2h6l-4-4M10 11l2 1 2-1"/><circle cx="10" cy="7" r=".6" fill="currentColor"/><circle cx="14" cy="7" r=".6" fill="currentColor"/></svg>;
}
const systems=[
  {name:'macOS' as const,variants:[['Apple silicon','darwin-arm64','macApple'],['Intel','darwin-amd64','macIntel']]},
  {name:'Windows' as const,variants:[['x64','windows-amd64.exe','windowsX64']]},
  {name:'Linux' as const,variants:[['x64','linux-amd64','linuxX64'],['ARM64','linux-arm64','linuxArm']]},
];
export default function DownloadOptions({onSelect}:{onSelect:(platform:string)=>void}) {
  return <div className="space-y-1">{systems.map(system=><div key={system.name} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1">
    <span className="flex w-24 items-center gap-2 text-muted"><PlatformIcon system={system.name}/>{system.name}</span>
    {system.variants.map(([label,id,key])=><a key={id} href={downloads+'/telay-'+id+'.zip'} download className="text-link inline-flex min-h-11 items-center" aria-label={t(key)} onClick={()=>onSelect(id)}>{label}</a>)}
  </div>)}</div>;
}
