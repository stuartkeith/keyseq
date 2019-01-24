export function arraySetAt(array, index, value) {
  const newArray = array.slice();

  newArray[index] = value;

  return newArray;
}
