import { useEffect, RefObject } from "react";

const events = [`mousedown`, `touchstart`];

const useClickOutside = <T extends HTMLElement>(
  ref: RefObject<T>,
  onClickOutside: () => void
): void => {
  useEffect(() => {
    const handleClick = (event: Event): void => {
      if (ref.current && !ref.current.contains(event.target as Node))
        onClickOutside();
    };

    const listener = (event: Event) => handleClick(event);
    events.forEach((event) => document.addEventListener(event, listener));

    return (): void => {
      events.forEach((event) => document.removeEventListener(event, listener));
    };
  }, [ref, onClickOutside]);
};

export default useClickOutside;
