import { useEffect, useRef } from "preact/hooks";
import "./language-menu";

export default function LanguageSelect() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      host.current ? window.telayLanguageMenu.mount(host.current) : undefined,
    [],
  );
  return <div ref={host} />;
}
