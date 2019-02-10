export function arraySetAt(array, index, value) {
  const newArray = array.slice();

  newArray[index] = value;

  return newArray;
}

export function arrayReplaceAt(array, index, callback) {
  return arraySetAt(array, index, callback(array[index]));
}
