import { useEffect, useRef } from "react";

export function useKeyShortcut(cb: () => void): void {
  const currentKeys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const combos: string[][] = [
      ["meta", "k"],
      ["control", "k"],
    ];

    function onKeydown(evt: KeyboardEvent): void {
      currentKeys.current[evt.key?.toLowerCase()] = true;

      const isComboValid = combos.some((combo) =>
        combo.every((key) => currentKeys.current[key])
      );

      if (isComboValid) cb();
    }

    const onKeyup = () => (currentKeys.current = {});

    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  }, [cb]);
}
