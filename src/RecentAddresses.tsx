import { useRecentAddresses } from "./history";
import { t } from "./i18n";
export default function RecentAddresses({
  address,
  disabled,
  onSelect,
}: {
  address: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const entries = useRecentAddresses();
  if (!entries.length) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <select
          className="recent-select flex-1"
          aria-label={t("recentAddresses")}
          disabled={disabled}
          value={
            entries.some((item) => item.address === address) ? address : ""
          }
          onChange={(event) => onSelect(event.currentTarget.value)}
        >
          <option value="">{t("recentAddresses")}</option>
          {entries.map((item) => (
            <option key={item.address} value={item.address}>
              {item.title || t("device")} · …{item.address.slice(-6)}
            </option>
          ))}
        </select>
        <button
          className="quiet-button text-xs text-muted"
          type="button"
          disabled={disabled}
          onClick={() => {
            window.relayHistory.clear();
            onSelect("");
          }}
        >
          {t("clearHistory")}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">
        {t(
          window.relayHistory.persisted
            ? "historyPrivacy"
            : "historyUnavailable",
        )}
      </p>
    </div>
  );
}
