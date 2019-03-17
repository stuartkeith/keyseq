export function chain(argument, ...functions) {
  let result = argument;

  for (let i = 0; i < functions.length; i++) {
    result = functions[i](result);
  }

  return result;
}
