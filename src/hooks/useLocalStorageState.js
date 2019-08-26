import { useEffect, useState } from "react";

function localStorageGetItemSafe(key, defaultValue) {
  let value;

  try {
    const localStorageValue = localStorage.getItem(key);

    value =
      localStorageValue !== null ? JSON.parse(localStorageValue) : defaultValue;
  } catch (e) {
    value = defaultValue;
  }

  return value;
}

function localStorageSetItemSafe(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    return;
  }
}

export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() =>
    localStorageGetItemSafe(key, defaultValue)
  );

  useEffect(
    function() {
      localStorageSetItemSafe(key, value);
    },
    [key, value]
  );

  return [value, setValue];
}
