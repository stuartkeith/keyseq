export function chain(argument, ...functions) {
  let result = argument;

  for (let i = 0; i < functions.length; i++) {
    result = functions[i](result);
  }

  return result;
}

// alternative to defining inline self-executing function
export const f = callback => callback();

export const passThrough = value => value;
