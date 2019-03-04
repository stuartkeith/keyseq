import { useEffect, useState } from 'react';

function localStorageGetItemSafe(key, defaultValue) {
  let value;

  try {
    value = JSON.parse(localStorage.getItem(key));
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
  const [value, setValue] = useState(() => localStorageGetItemSafe(key, defaultValue));

  useEffect(function () {
    localStorageSetItemSafe(key, value);
  }, [value]);

  return [value, setValue];
};
