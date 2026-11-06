import {useState} from 'react';
import {Check, Copy} from 'lucide-react';
import {t} from './i18n';
import DownloadOptions from './DownloadOptions';
import {installCommand,startCommand} from './commands';

export default function QuickInstall() {
  const [method, setMethod] = useState<'wget' | 'curl'>('wget');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [platform, setPlatform] = useState('darwin-arm64');
  const [upstream,setUpstream]=useState('');
  const web = location.origin;
  const install=installCommand(web,method);
  const run=startCommand(web,upstream);
  const manualRun=startCommand(web,upstream,platform);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError('');
      setCopied(key);
      setTimeout(() => setCopied(current => current === key ? '' : current), 1800);
    } catch {
      setError('copyFailed');
    }
  }

  function command(value: string, key: string, label: string) {
    return <div className="code-block mt-3 flex items-start gap-2">
      <code id={key === 'install' ? 'quick-install-command' : key === 'run' ? 'quick-run-command' : undefined} className="min-w-0 flex-1 break-all text-xs leading-6">{value}</code>
      <button id={key === 'install' ? 'copy-quick-install' : undefined} type="button" className="quiet-button -mr-2 -mt-2 shrink-0" aria-label={label} onClick={() => copy(value, key)}>
        {copied === key ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>;
  }

  return <div className="pb-4 pt-1 text-sm leading-6">
    <div className="flex items-center justify-between gap-4">
      <p>{t('installTerminal')}</p>
      <div className="flex gap-1" role="group" aria-label={t('installTools')}>
        {(['wget', 'curl'] as const).map(value => <button key={value} type="button" aria-pressed={method === value}
          className={'quiet-button text-xs ' + (method === value ? 'bg-surface font-medium text-ink' : 'text-muted')}
          onClick={() => {setMethod(value); setCopied(''); setError('')}}>{value}</button>)}
      </div>
    </div>
    {command(install, 'install', t('copyInstall', {method}))}
    <p className="mt-3 text-xs leading-5 text-muted">{t('scriptWarning')} <a className="text-link" href="/install.sh" target="_blank" rel="noreferrer">{t('viewScript')}</a></p>
    <p className="mt-6">{t('runAfterInstall')}</p>
    <form onSubmit={event=>event.preventDefault()} autoComplete="off">
      <label htmlFor="local-service" className="mb-2 mt-3 block text-xs text-muted">{t('upstreamLabel')}</label>
      <input id="local-service" className="field w-full font-mono" type="password" autoComplete="off" spellCheck={false} value={upstream} placeholder={t('upstreamPlaceholder')} onChange={event=>{setUpstream(event.target.value);setCopied('')}} aria-describedby="local-service-hint"/>
    </form>
    {command(run, 'run', t('copyRun'))}
    <p id="local-service-hint" className="mt-3 text-xs leading-5 text-muted">{t(upstream.trim()?'runDirectHint':'runHint')}</p>
    <p role="status" className={'mt-2 text-xs ' + (error ? 'text-danger' : 'text-muted')}>{error ? t(error) : copied ? t('copied') : ''}</p>
    <details className="mt-3 text-xs">
      <summary className="py-3 text-muted">{t('otherMethods')}</summary>
      <p className="mb-3 text-muted">{t('manualInstall')}</p>
      <DownloadOptions onSelect={setPlatform}/>
      <p className="mt-4 text-muted">{t('chmodBefore')}<code>chmod +x telay-*</code>{t('chmodAfter')}</p>
      {command(manualRun, 'manual', t('copyManualRun'))}
      <p className="mt-3 text-muted">{t('unsignedWarning')}</p>
      <a className="text-link mt-3 inline-block" href="https://raw.githubusercontent.com/GitaiQAQ/telay/main/public/downloads/SHA256SUMS">{t('checksums')}</a>
    </details>
  </div>;
}
