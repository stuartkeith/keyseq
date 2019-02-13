export function arraySetAt(array, index, value) {
  const newArray = array.slice();

  newArray[index] = value;

  return newArray;
}

export function arrayReplaceAt(array, index, callback) {
  return arraySetAt(array, index, callback(array[index]));
}

export function arrayShiftBy(array, direction) {
  const boundOffset = Math.abs(direction) % array.length;
  const index = direction < 0 ? boundOffset : array.length - boundOffset;

  return [
    ...array.slice(index),
    ...array.slice(0, index)
  ];
}
