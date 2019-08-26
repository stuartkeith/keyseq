function incrementValue(value, maxValue) {
  return value === maxValue ? 0 : value + 1;
}

function decrementValue(value, maxValue) {
  return value === 0 ? maxValue : value - 1;
}

export function create(maxLength) {
  return {
    array: new Array(maxLength + 1).fill(null),
    indexHead: 0,
    indexTail: 0,
    indexMax: maxLength
  };
}

export function clear(t) {
  return {
    ...t,
    indexHead: 0,
    indexTail: 0
  };
}

export function isEmpty(t) {
  return t.indexHead === t.indexTail;
}

export function push(t, value) {
  t.array[t.indexHead] = value;

  const indexHead = incrementValue(t.indexHead, t.indexMax);
  const indexTail =
    indexHead === t.indexTail
      ? incrementValue(t.indexTail, t.indexMax)
      : t.indexTail;

  return {
    ...t,
    indexHead,
    indexTail
  };
}

export function pop(t) {
  if (isEmpty(t)) {
    throw new Error("stack is empty");
  }

  const indexHead = decrementValue(t.indexHead, t.indexMax);

  return {
    ...t,
    indexHead
  };
}

export function read(t) {
  if (isEmpty(t)) {
    throw new Error("stack is empty");
  }

  const arrayIndex = decrementValue(t.indexHead, t.indexMax);

  return t.array[arrayIndex];
}
