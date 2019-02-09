// alternative to defining inline self-executing function
export function f(callback) {
  return callback();
}
