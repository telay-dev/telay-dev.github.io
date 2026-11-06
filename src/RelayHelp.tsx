import {t} from './i18n';

export default function RelayHelp() {
  return <div className="space-y-5 pb-5 pt-1 text-sm leading-6 text-muted">
    <p>{t('helpConnect')}</p>
    <p>{t('helpLifecycle')}</p>
    <details>
      <summary className="py-2 text-ink">{t('dshSetup')}</summary>
      <div className="mt-2 space-y-3 text-xs">
        <p>{t('dshURL')}</p>
        <pre className="code-block overflow-x-auto"><code>npx @deepseek-ai/dsh web --no-open</code></pre>
        <p>{t('dshProfileBefore')}<code>--profile dsh</code>{t('dshProfileAfter')}</p>
      </div>
    </details>
    <details>
      <summary className="py-2 text-ink">{t('limitations')}</summary>
      <div className="mt-2 space-y-3 text-xs">
        <p>{t('helpDirect')}</p>
        <p>{t('helpRelay')}</p>
        <p>{t('helpProtocols')}</p>
        <p>{t('helpSafety')}</p>
      </div>
    </details>
  </div>;
}
