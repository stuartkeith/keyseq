import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useRefLazy } from './effects/useRefLazy';
import { useViewport } from './effects/useViewport';
import { arraySetAt } from './utils/array';
import { chain, f, passThrough } from './utils/function';
import * as stack from './utils/stack';
import audioContext from './webaudio/audioContext';
import Scheduler from './webaudio/Scheduler';
import VisualScheduler from './webaudio/VisualScheduler';

const inRange = (value, min, max) => Math.min(max, Math.max(min, value));

const sequenceKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
const sequenceKeyLabels = ['1', '2', '3', '4', '5', '6', '7', '8'];

function numberToPercentageString(number) {
  return `${Math.floor(number * 100)}%`;
}

function generateColumnColorSet(index, lightnessModifier) {
  const startDegree = 214;
  const degreeStep = 25;
  const saturation = 47;

  const hue = startDegree + (degreeStep * index);

  return {
    background: `hsl(${hue}, ${saturation}%, ${80 + lightnessModifier}%)`,
    foreground: `hsl(${hue}, ${saturation}%, ${64 + lightnessModifier}%)`,
    text: `hsl(${hue}, ${saturation}%, 19%)`,
  };
}

function generateColumnColors(index) {
  return [
    generateColumnColorSet(index, 0),
    generateColumnColorSet(index, 3)
  ];
}

function arrayColumn(defaultIndex, array, toString) {
  return {
    defaultValue: array[defaultIndex],
    denormalise: (normalisedValue) => {
      // convert 0 to 1 to array value
      const arrayIndex = inRange(Math.floor(normalisedValue * array.length), 0, array.length - 1);

      return array[arrayIndex];
    },
    normalise: (value) => {
      // convert value in array to 0 to 1
      const index = array.indexOf(value);

      if (index < 0) {
        throw new Error('Invalid cell value');
      }

      return (index + 1) / array.length;
    },
    toString: (value) => toString(value, array)
  };
}

function integerColumn(defaultValue, minValue, maxValue, toString) {
  const range = (maxValue - minValue) + 1;

  return {
    defaultValue,
    denormalise: (normalisedValue) => {
      return inRange(minValue + Math.floor(normalisedValue * range), minValue, maxValue);
    },
    normalise: (value) => {
      return (value - minValue + 1) / range;
    },
    toString
  };
}

function numberColumn(defaultValue, minValue, maxValue, toString) {
  const range = maxValue - minValue;

  return {
    defaultValue,
    denormalise: (normalisedValue) => {
      return minValue + (range * normalisedValue);
    },
    normalise: (value) => {
      return (value - minValue) / range;
    },
    toString
  };
}

let colorIndex = 0;

const columns = [
  {
    label: 'Note',
    key: 'note',
    colors: generateColumnColors(colorIndex++),
    // harmonic minor scale:
    ...arrayColumn(
      0,
      [null, 0, 2, 3, 5, 7, 8, 11],
      (value, array) => value === null ? '-' : array.indexOf(value).toString()
    )
  },
  {
    label: 'Octave',
    key: 'octave',
    colors: generateColumnColors(colorIndex++),
    ...integerColumn(0, -2, 2, passThrough)
  },
  {
    label: 'Gain',
    key: 'gain',
    colors: generateColumnColors(colorIndex++),
    ...numberColumn(1, 0.4, 1, numberToPercentageString)
  },
  {
    label: 'Filter Frequency',
    key: 'filterFrequency',
    defaultValue: 1,
    colors: generateColumnColors(colorIndex++),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'Filter Resonance',
    key: 'filterResonance',
    defaultValue: 0,
    colors: generateColumnColors(colorIndex++),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'LFO Frequency',
    key: 'lfoFrequency',
    defaultValue: 0,
    colors: generateColumnColors(colorIndex++),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'LFO Gain',
    key: 'lfoGain',
    defaultValue: 0,
    colors: generateColumnColors(colorIndex++),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'Decay',
    key: 'decay',
    defaultValue: 0.5,
    colors: generateColumnColors(colorIndex++),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'Waveform',
    key: 'waveform',
    colors: generateColumnColors(colorIndex++),
    ...arrayColumn(
      0,
      ['sawtooth', 'square', 'sine'],
      passThrough
    )
  }
];

const emptyCell = f(() => {
  const cell = {};

  columns.forEach(column => cell[column.key] = column.defaultValue);

  return cell;
});

const KEYBOARD_MODE_NORMAL = 'KEYBOARD_MODE_NORMAL';
const KEYBOARD_MODE_INVERT = 'KEYBOARD_MODE_INVERT';

const initialState = {
  rawKeyState: sequenceKeys.map(_ => false),
  keyboardMode: KEYBOARD_MODE_NORMAL,
  sequence: sequenceKeys.map(_ => emptyCell),
  sequenceBeforeCurrentEdit: null,
  undoStack: stack.create(32)
};

function getKeyCount(keyState) {
  return keyState.reduce((count, value) => count + (value ? 1 : 0), 0);
}

function getKeyState(rawKeyState, keyboardMode) {
  switch (keyboardMode) {
    case KEYBOARD_MODE_NORMAL:
      return rawKeyState;
    case KEYBOARD_MODE_INVERT:
      return rawKeyState.map(value => !value);
    default:
      throw new Error('invalid keyboardMode - ' + keyboardMode);
  }
}

function updateSequence(state, action) {
  const keyState = getKeyState(state.rawKeyState, state.keyboardMode);

  // no need to process if no keys held down
  if (getKeyCount(keyState) === 0) {
    return state;
  }

  return {
    ...state,
    sequence: state.sequence.map(function (cell, index) {
      if (keyState[index] === false) {
        return cell;
      }

      return {
        ...cell,
        [action.selectedColumn.key]: action.selectedColumnValue
      };
    })
  };
}

function getNewStateFromKeyChange(state, nextRawKeyState, nextKeyboardMode) {
  const existingKeyState = getKeyState(state.rawKeyState, state.keyboardMode);
  const existingKeyCount = getKeyCount(existingKeyState);

  const nextKeyState = getKeyState(nextRawKeyState, nextKeyboardMode);
  const nextKeyCount = getKeyCount(nextKeyState);

  const isFirstKeyDown = existingKeyCount === 0 && nextKeyCount > 0;
  const isLastKeyDown = existingKeyCount > 0 && nextKeyCount === 0;

  const sequenceBeforeCurrentEdit = isFirstKeyDown ? state.sequence : state.sequenceBeforeCurrentEdit;
  const undoStack = isLastKeyDown ? stack.push(state.undoStack, state.sequenceBeforeCurrentEdit) : state.undoStack;

  return {
    ...state,
    rawKeyState: nextRawKeyState,
    keyboardMode: nextKeyboardMode,
    sequenceBeforeCurrentEdit,
    undoStack
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'resetSequence':
      return {
        ...state,
        sequence: initialState.sequence,
        undoStack: stack.push(state.undoStack, state.sequence)
      };
    case 'setKeyboardMode':
      return chain(
        state,
        state => getNewStateFromKeyChange(state, state.rawKeyState, action.keyboardMode),
        action.shouldUpdateSequence ? state => updateSequence(state, action) : passThrough
      );
    case 'keyDown':
      return chain(
        state,
        state => getNewStateFromKeyChange(state, arraySetAt(state.rawKeyState, action.sequenceKeysIndex, true), state.keyboardMode),
        state => updateSequence(state, action)
      );
    case 'keyUp':
      return getNewStateFromKeyChange(state, arraySetAt(state.rawKeyState, action.sequenceKeysIndex, false), state.keyboardMode);
    case 'mouseMove':
      return updateSequence(state, action);
    case 'shiftSequence':
      const boundOffset = Math.abs(action.direction) % state.sequence.length;
      const startIndex = action.direction < 0 ? boundOffset : state.sequence.length - boundOffset;

      return {
        ...state,
        sequence: state.sequence.map(function (cell, index) {
          const targetIndex = (index + startIndex) % state.sequence.length;

          return {
            ...cell,
            [action.selectedColumn.key]: state.sequence[targetIndex][action.selectedColumn.key]
          };
        }),
        undoStack: stack.push(state.undoStack, state.sequence)
      }
    case 'randomiseSequence':
      const keyState = getKeyState(state.rawKeyState, state.keyboardMode);
      const anyKeysAreDown = !!keyState.find(x => x);

      return {
        ...state,
        sequence: state.sequence.map((cell, index) => {
          if (anyKeysAreDown && !keyState[index]) {
            return cell;
          }

          return {
            ...cell,
            [action.selectedColumn.key]: action.selectedColumn.denormalise(Math.random())
          };
        }),
        undoStack: stack.push(state.undoStack, state.sequence)
      };
    case 'popUndo':
      if (stack.isEmpty(state.undoStack)) {
        return state;
      }

      return {
        ...state,
        sequence: stack.read(state.undoStack),
        undoStack: stack.pop(state.undoStack)
      };
    default:
      throw new Error('Unrecognised action type - ' + action.type);
  }
}

function useMouse(elementRef, viewportDimensions) {
  const [position, setPosition] = useState([0, 0]);
  const elementOffset = useRef();

  useEffect(function () {
    const boundingClientRect = elementRef.current.getBoundingClientRect();

    elementOffset.current = [
      boundingClientRect.left + window.pageXOffset,
      boundingClientRect.top + window.pageYOffset,
      boundingClientRect.width,
      boundingClientRect.height
    ];
  }, [viewportDimensions]);

  useEffect(function () {
    const onMouseMove = function (event) {
      const [elementX, elementY, elementWidth, elementHeight] = elementOffset.current;

      const offsetX = event.pageX - elementX;
      const offsetY = event.pageY - elementY;

      const x = inRange(offsetX / elementWidth, 0, 1);
      const y = inRange(offsetY / elementHeight, 0, 1);

      setPosition([x, 1 - y]);
    };

    window.addEventListener('mousemove', onMouseMove);

    return function () {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return position;
}

function useKeyboard(callback, inputs) {
  const stateRef = useRef({});
  const state = stateRef.current;

  useEffect(function () {
    // prevent stuck keys
    const onWindowBlur = function () {
      Object.keys(state).forEach(function (key) {
        if (state[key]) {
          state[key] = false;

          callback(key, false);
        }
      });
    };

    const onKeyDown = function (event) {
      if (state[event.code] === true) {
        return;
      }

      state[event.code] = true;

      callback(event.code, true);
    };

    const onKeyUp = function (event) {
      state[event.code] = false;

      callback(event.code, false);
    };

    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return function () {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, inputs);
}

function playSynthNote(cell, startTime, destinationNode) {
  const scaleNote = cell.note + (cell.octave * 12) - 12;

  const frequency = 440 * Math.pow(2, (scaleNote + 3) / 12);

  // create nodes
  const osc = audioContext.createOscillator();
  osc.type = cell.waveform;
  osc.frequency.value = frequency;

  const filterMin = 100;
  const filterMax = 22000;
  const filterRange = filterMax - filterMin;
  const filterLog = Math.log2(filterMax / filterMin);
  const filterLogScale = filterMin + (filterRange * Math.pow(2, filterLog * (cell.filterFrequency - 1)));

  const lowpassNode = audioContext.createBiquadFilter();
  lowpassNode.type = 'lowpass';
  lowpassNode.frequency.value = filterLogScale;
  lowpassNode.Q.value = cell.filterResonance * 30;

  const noteTime = 0.1 + (cell.decay * 3);

  const gainNode = audioContext.createGain();

  gainNode.gain.setValueAtTime(Math.pow(cell.gain, 1.6), startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + noteTime);

  const lfo = audioContext.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = cell.lfoFrequency * 17;

  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = cell.lfoGain * 25;

  osc.start(startTime);
  osc.stop(startTime + noteTime);

  lfo.start(startTime);
  lfo.stop(startTime + noteTime);

  // routing
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(lowpassNode);
  lowpassNode.connect(gainNode);
  gainNode.connect(destinationNode);
}

function useSequencer(isPlaying, sequence, destinationNode, dispatch) {
  const [index, setIndex] = useState(0);

  const scheduler = useRefLazy(() => new Scheduler(96));
  const visualScheduler = useRefLazy(() => new VisualScheduler());

  scheduler.callback = function (beatTime, beatLength, index) {
    const sequenceIndex = index % sequence.length;
    const cell = sequence[sequenceIndex];
    const beatTimeOffset = beatTime + (sequenceIndex % 2 ? 0 : beatLength * 0.3);

    if (cell.note !== null && cell.gain > 0) {
      playSynthNote(cell, beatTimeOffset, destinationNode);
    }

    visualScheduler.push(sequenceIndex, beatTimeOffset);
  };

  visualScheduler.callback = function (value) {
    setIndex(value);
  };

  if (isPlaying) {
    scheduler.start();
  } else {
    scheduler.stop();
  }

  return [index];
}

function VerticalMeter({ colors, scale, children }) {
  return (
    <div
      className="flex-auto-basis relative flex justify-center items-center z-0"
      style={{
        backgroundColor: colors.background,
        color: colors.text
      }}
    >
      <div
        className="absolute absolute--fill z-minus-1"
        style={{
          backgroundColor: colors.foreground,
          transform: `scale3d(1, ${scale}, 1)`,
          transformOrigin: '100% 100%'
        }}
      />
      {children}
    </div>
  );
}

function Button({ disabled, onClick, children }) {
  const className = `
    input-reset bg-white dark-gray dib bw0 w3 pa2 box-shadow-1 flex-none
    ${disabled ? 'moon-gray' : 'dark-gray'}
  `;

  return (
    <button
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function KeySeq({ destinationNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sequencerIndex] = useSequencer(isPlaying, state.sequence, destinationNode);

  const mouseRef = useRef();
  const viewportDimensions = useViewport();
  const [mouseX, mouseY] = useMouse(mouseRef, viewportDimensions);

  const selectedColumnIndex = inRange(Math.floor(mouseX * columns.length), 0, columns.length - 1);
  const selectedColumn = columns[selectedColumnIndex];
  const selectedColumnValue = selectedColumn.denormalise(mouseY);

  useKeyboard(function (key, isDown) {
    const sequenceKeysIndex = sequenceKeys.indexOf(key);

    if (sequenceKeysIndex >= 0) {
      if (isDown) {
        dispatch({
          type: 'keyDown',
          sequenceKeysIndex,
          selectedColumn,
          selectedColumnValue
        });
      } else {
        dispatch({
          type: 'keyUp',
          sequenceKeysIndex
        });
      }

      return;
    }

    const direction = f(() => {
      if (isDown) {
        if (key === 'ArrowLeft') {
          return -1;
        }

        if (key === 'ArrowRight') {
          return 1;
        }
      }

      return 0;
    });

    if (direction !== 0) {
      dispatch({
        type: 'shiftSequence',
        selectedColumn,
        direction
      });

      return;
    }

    if (isDown && (key === 'ArrowUp' || key === 'ArrowDown')) {
      dispatch({
        type: 'randomiseSequence',
        selectedColumn
      });

      return;
    }

    if (key === 'ShiftLeft' || key === 'ShiftRight') {
      dispatch({
        type: 'setKeyboardMode',
        keyboardMode: isDown ? KEYBOARD_MODE_INVERT : KEYBOARD_MODE_NORMAL,
        selectedColumn,
        selectedColumnValue,
        shouldUpdateSequence: isDown
      });

      return;
    }
  }, [sequenceKeys, state, dispatch, selectedColumn, selectedColumnValue]);

  // mouse move
  useEffect(function () {
    dispatch({
      type: 'mouseMove',
      selectedColumn,
      selectedColumnValue
    });
  }, [mouseX, mouseY]);

  const keyState = getKeyState(state.rawKeyState, state.keyboardMode);

  return (
    <div className="h-100 relative bg-dark-gray">
      <div className="absolute absolute--fill flex mv4" ref={mouseRef}>
        {columns.map(function (column, index) {
          const scale = column === selectedColumn ? selectedColumn.normalise(selectedColumnValue) : 0;

          return (
            <VerticalMeter
              key={index}
              colors={column.colors[0]}
              scale={scale}
            />
          );
        })}
      </div>
      <div className="absolute absolute--fill flex flex-column justify-center items-center">
        <div className="f3 tc dark-gray">
          <p className="ma0 mb2 b">{selectedColumn.label}</p>
          <p className="ma0 mb4">{selectedColumn.toString(selectedColumnValue)}</p>
        </div>
        <div className="flex box-shadow-1">
          {keyState.map(function (value, index) {
            const containerStyle = {
              opacity: index === sequencerIndex ? '1' : '0.55',
              width: '66px',
              height: '66px',
              willChange: 'opacity'
            };

            const y = value ? '10%' : '0';

            const labelStyle = {
              transform: `translate3d(0, ${y}, 0)`,
              transition: 'transform 173ms',
            };

            const cellValue = selectedColumn.normalise(state.sequence[index][selectedColumn.key]);

            return (
              <div
                key={index}
                className="relative flex overflow-hidden"
                style={containerStyle}
              >
                <VerticalMeter
                  colors={selectedColumn.colors[index % selectedColumn.colors.length]}
                  scale={cellValue}
                />
                <div
                  className="absolute absolute--fill flex justify-center items-center f4"
                  style={labelStyle}
                >
                  {sequenceKeyLabels[index]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative pa3 flex">
        <Button
          onClick={() => setIsPlaying(!isPlaying)}
        >
            {isPlaying ? 'Stop' : 'Play'}
        </Button>
        <span className="dib w1 flex-none" />
        <Button
          disabled={stack.isEmpty(state.undoStack)}
          onClick={() => dispatch({ type: 'popUndo' })}
        >
            Undo
        </Button>
        <span className="dib w2 flex-none" />
        <Button
          disabled={stack.isEmpty(state.undoStack)}
          onClick={() => dispatch({ type: 'resetSequence' })}
        >
            Reset
        </Button>
      </div>
    </div>
  );
};
