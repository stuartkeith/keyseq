import React, { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ButtonA } from './components/ButtonA';
import { CheckboxA } from './components/CheckboxA';
import { GainContext, GainRange } from './components/GainRange';
import { RangeA } from './components/RangeA';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useRefLazy } from './hooks/useRefLazy';
import { useViewport } from './hooks/useViewport';
import { arrayReplaceAt, arraySetAt } from './utils/array';
import { chain, f, passThrough } from './utils/function';
import { inRange } from './utils/number';
import * as stack from './utils/stack';
import audioContext from './webaudio/audioContext';
import Scheduler from './webaudio/Scheduler';
import VisualScheduler from './webaudio/VisualScheduler';

function numberToPercentageString(number) {
  return `${Math.floor(number * 100)}%`;
}

// generate background/foreground colours for a column dynamically.
function generateColumnColorSet(index, lightnessModifier) {
  const startDegree = 214;
  const degreeStep = 25;
  const saturation = 47;

  const hue = startDegree + (degreeStep * index);

  return {
    background: `hsl(${hue}, ${saturation}%, ${80 + lightnessModifier}%)`,
    foreground: `hsl(${hue}, ${saturation}%, ${64 + lightnessModifier}%)`
  };
}

// we need two sets of colours - the second is used when two columns are
// displayed next to each other.
function generateColumnColors(index) {
  return [
    generateColumnColorSet(index, 0),
    generateColumnColorSet(index, 3)
  ];
}

const sequenceKeys = [
  { code: 'Digit1', label: '1' },
  { code: 'Digit2', label: '2' },
  { code: 'Digit3', label: '3' },
  { code: 'Digit4', label: '4' },
  { code: 'Digit5', label: '5' },
  { code: 'Digit6', label: '6' },
  { code: 'Digit7', label: '7' },
  { code: 'Digit8', label: '8' }
];

const sequencesIndexKeys = [
  { code: 'KeyZ', label: 'Z' },
  { code: 'KeyX', label: 'X' },
  { code: 'KeyC', label: 'C' },
  { code: 'KeyV', label: 'V' }
];

const KEYBOARD_MODE_NORMAL = 'KEYBOARD_MODE_NORMAL';
const KEYBOARD_MODE_INVERT = 'KEYBOARD_MODE_INVERT';

const columnKeys = ['note', 'octave', 'gain', 'decay', 'waveform'];

const columnKeysAdvanced = [
  ...columnKeys,
  'filterFrequency', 'filterResonance',
  'lfoGain', 'lfoFrequency'
];

// column definitions - determines how each column is displayed, its defaults,
// and how values are converted to and from mouse coordinates.
const columns = f(() => {
  const columns = {
    note: {
      label: 'Note',
      key: 'note',
      ...arrayColumn(
        0,
        [null, 0, 2, 3, 5, 7, 8, 11], // harmonic minor scale
        (value, array) => value === null ? '-' : array.indexOf(value).toString()
      )
    },
    octave: {
      label: 'Octave',
      key: 'octave',
      ...integerColumn(0, -2, 2, value => `${value >= 0 ? '+' : ''}${value}`)
    },
    gain: {
      label: 'Gain',
      key: 'gain',
      ...numberColumn(1, 0.4, 1, numberToPercentageString)
    },
    filterFrequency: {
      label: 'Filter Frequency',
      key: 'filterFrequency',
      defaultValue: 1,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    filterResonance: {
      label: 'Filter Resonance',
      key: 'filterResonance',
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    lfoFrequency: {
      label: 'LFO Frequency',
      key: 'lfoFrequency',
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    lfoGain: {
      label: 'LFO Gain',
      key: 'lfoGain',
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    decay: {
      label: 'Decay',
      key: 'decay',
      defaultValue: 0.5,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    waveform: {
      label: 'Waveform',
      key: 'waveform',
      ...arrayColumn(
        0,
        ['sawtooth', 'square', 'sine'],
        passThrough
      )
    }
  };

  return columns;

  // helper to create a column that represents a specific value within an array.
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

  // helper to create a column that represents an integer value.
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

  // helper to create a column that represents a number value.
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
});

// main app reducer, with helpers.
const [reducer, initialState, getCurrentSequence, getKeyState] = f(() => {
  // a sequence is an array of cells, each cell holding values for each column.
  const emptyCell = createCell(column => column.defaultValue);
  const emptySequence = sequenceKeys.map(() => emptyCell);

  const initialState = {
    // physicalKeyState - "physical" in that the actual key state used is
    // determined by the keyboard mode.
    // for example, the keyboard mode can invert the keys held.
    physicalKeyState: sequenceKeys.map(() => false),
    keyboardMode: KEYBOARD_MODE_NORMAL,
    // multiple sequences are stored in an array, with an index determining the
    // currently edited sequence.
    sequences: sequencesIndexKeys.map(() => emptySequence),
    sequencesIndex: 0,
    // when a user begins editing a sequence, we do not want to push it to the
    // undo stack until the user has finished editing the sequence. so we store
    // the value here in the meantime.
    sequencesBeforeCurrentEdit: null,
    undoStack: stack.create(32)
  };

  return [reducer, initialState, getCurrentSequence, getKeyState];

  // a cell holds values for each column.
  function createCell(valueCallback) {
    const cell = {};

    Object.keys(columns).forEach(key => {
      cell[key] = valueCallback(columns[key]);
    });

    return cell;
  }

  function getKeyCount(keyState) {
    return keyState.reduce((count, value) => count + (value ? 1 : 0), 0);
  }

  function getKeyState(physicalKeyState, keyboardMode) {
    switch (keyboardMode) {
      case KEYBOARD_MODE_NORMAL:
        return physicalKeyState;
      case KEYBOARD_MODE_INVERT:
        return physicalKeyState.map(value => !value);
      default:
        throw new Error('invalid keyboardMode - ' + keyboardMode);
    }
  }

  function getCurrentSequence(state) {
    return state.sequences[state.sequencesIndex];
  }

  function replaceCurrentSequence(state, callback) {
    return arrayReplaceAt(state.sequences, state.sequencesIndex, callback);
  }

  function mapCurrentSequence(state, callback) {
    return replaceCurrentSequence(state, sequence => sequence.map(callback));
  }

  // state update helper function. we have an action containing a particular
  // column and value we want to update in the current sequence, but only in
  // cells that the key state says are held down.
  function updateSequenceWithAction(state, action) {
    const keyState = getKeyState(state.physicalKeyState, state.keyboardMode);

    // if no keys are down, there's nothing to do.
    if (getKeyCount(keyState) === 0) {
      return state;
    }

    return {
      ...state,
      sequences: mapCurrentSequence(state, function (cell, index) {
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

  // state update helper function. we have had a change in either the physical
  // key state or the keyboard mode and need to determine whether sequences
  // should be either pushed to the undo stack (at the end of the user input) or
  // stored to be pushed later (at the start of the user input).
  function getNewStateFromKeyChange(state, nextPhysicalKeyState, nextKeyboardMode) {
    const existingKeyState = getKeyState(state.physicalKeyState, state.keyboardMode);
    const existingKeyCount = getKeyCount(existingKeyState);

    const nextKeyState = getKeyState(nextPhysicalKeyState, nextKeyboardMode);
    const nextKeyCount = getKeyCount(nextKeyState);

    const isFirstKeyDown = existingKeyCount === 0 && nextKeyCount > 0;
    const isLastKeyDown = existingKeyCount > 0 && nextKeyCount === 0;

    // if this is the first key down, store the existing sequences state to push
    // to the undo stack later.
    const sequencesBeforeCurrentEdit = isFirstKeyDown ? state.sequences : state.sequencesBeforeCurrentEdit;
    // or if this is the last key down, push that stored sequences state to the
    // undo stack.
    const undoStack = isLastKeyDown ? stack.push(state.undoStack, state.sequencesBeforeCurrentEdit) : state.undoStack;

    return {
      ...state,
      physicalKeyState: nextPhysicalKeyState,
      keyboardMode: nextKeyboardMode,
      sequencesBeforeCurrentEdit,
      undoStack
    };
  }

  function reducer(state, action) {
    switch (action.type) {
      case 'resetSequence':
        return {
          ...state,
          sequences: replaceCurrentSequence(state, _ => emptySequence),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case 'selectSequence':
        return {
          ...state,
          sequencesIndex: action.sequencesIndex
        };
      case 'setKeyboardMode':
        return chain(
          state,
          state => getNewStateFromKeyChange(state, state.physicalKeyState, action.keyboardMode),
          action.shouldUpdateSequence ? state => updateSequenceWithAction(state, action) : passThrough
        );
      case 'keyDown':
        return chain(
          state,
          state => getNewStateFromKeyChange(state, arraySetAt(state.physicalKeyState, action.sequenceKeysIndex, true), state.keyboardMode),
          state => updateSequenceWithAction(state, action)
        );
      case 'keyUp':
        return getNewStateFromKeyChange(state, arraySetAt(state.physicalKeyState, action.sequenceKeysIndex, false), state.keyboardMode);
      case 'mouseMove':
        return updateSequenceWithAction(state, action);
      case 'shiftSequence':
        const sequence = getCurrentSequence(state);
        const columnKey = action.selectedColumn.key;

        // if all column values in the sequence are equal, there will be no
        // visual difference. bail out to avoid an unnecessary undo stack push.
        const areAllSequenceColumnValuesEqual = f(() => {
          for (let i = 1; i < sequence.length; i++) {
            if (sequence[i - 1][columnKey] !== sequence[i][columnKey]) {
              return false;
            }
          }

          return true;
        });

        if (areAllSequenceColumnValuesEqual) {
          return state;
        }

        const boundOffset = Math.abs(action.direction) % sequence.length;
        const startIndex = action.direction < 0 ? boundOffset : sequence.length - boundOffset;

        return {
          ...state,
          sequences: mapCurrentSequence(state, function (cell, index) {
            const targetIndex = (index + startIndex) % sequence.length;

            return {
              ...cell,
              [columnKey]: sequence[targetIndex][columnKey]
            };
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        }
      case 'randomiseAll':
        return {
          ...state,
          sequences: mapCurrentSequence(state, function () {
            return createCell(column => column.denormalise(Math.random()));
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case 'randomiseSequence':
        const keyState = getKeyState(state.physicalKeyState, state.keyboardMode);
        const anyKeysAreDown = !!keyState.find(x => x);

        return {
          ...state,
          sequences: mapCurrentSequence(state, function (cell, index) {
            if (anyKeysAreDown && !keyState[index]) {
              return cell;
            }

            return {
              ...cell,
              [action.selectedColumn.key]: action.selectedColumn.denormalise(Math.random())
            };
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case 'popUndo':
        if (stack.isEmpty(state.undoStack)) {
          return state;
        }

        return {
          ...state,
          sequences: stack.read(state.undoStack),
          undoStack: stack.pop(state.undoStack)
        };
      default:
        throw new Error('Unrecognised action type - ' + action.type);
    }
  }
});

// a hook that listens to the window's mousemove events and returns mouse
// coordinates relative to the specified element, normalised to a range of 0
// to 1.
function useMouse(elementRef, viewportDimensions) {
  const [position, setPosition] = useState([0, 0]);
  const elementOffset = useRef();

  // only remeasure the element when the viewport is resized.
  // we can use a ref here as the new values are only needed on the next
  // mouse event.
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

// a hook that listens to the window's keyboard events, ignoring repeated
// keydown events. also handles the window losing focus while keys are being
// held, to avoid stuck keys.
function useKeyboard(callback, inputs) {
  const stateRef = useRef({});
  const state = stateRef.current;

  useEffect(function () {
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
  // create nodes.
  const osc = f(() => {
    const scaleNote = cell.note + (cell.octave * 12) - 12;
    const frequency = 440 * Math.pow(2, (scaleNote + 3) / 12);

    const osc = audioContext.createOscillator();
    osc.type = cell.waveform;
    osc.frequency.value = frequency;

    return osc;
  });

  const lowpassNode = f(() => {
    const filterMin = 100;
    const filterMax = 22000;
    const filterRange = filterMax - filterMin;
    const filterLog = Math.log2(filterMax / filterMin);
    const filterLogScale = filterMin + (filterRange * Math.pow(2, filterLog * (cell.filterFrequency - 1)));

    const lowpassNode = audioContext.createBiquadFilter();
    lowpassNode.type = 'lowpass';
    lowpassNode.frequency.value = filterLogScale;
    lowpassNode.Q.value = cell.filterResonance * 30;

    return lowpassNode;
  });

  const gainNode = audioContext.createGain();

  const lfo = audioContext.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = cell.lfoFrequency * 17;

  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = cell.lfoGain * 25;

  // set values that change over time.
  const stopTime = f(() => {
    const decayTime = 0.06 + (cell.decay * 3);

    // increment inline as we go, so the value is relative to the previous
    // value. as a bonus, the final value after fade out will then indicate the
    // time the note can be inaudibly stopped.
    let currentTime = startTime;

    gainNode.gain.setValueAtTime(Math.pow(cell.gain, 1.6), currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, currentTime += decayTime);

    return currentTime;
  });

  // start oscillators.
  osc.start(startTime);
  osc.stop(stopTime);

  lfo.start(startTime);
  lfo.stop(stopTime);

  // route nodes.
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(lowpassNode);
  lowpassNode.connect(gainNode);
  gainNode.connect(destinationNode);
}

function useSequencer(bpm, swing, isPlaying, sequence, destinationNode) {
  const [index, setIndex] = useState(0);

  const scheduler = useRefLazy(() => new Scheduler());
  const visualScheduler = useRefLazy(() => new VisualScheduler());

  scheduler.bpm = bpm;

  scheduler.callback = function (beatTime, beatLength, index) {
    const sequenceIndex = index % sequence.length;
    const cell = sequence[sequenceIndex];
    const beatSwingOffset = sequenceIndex % 2 ? 0 : beatLength * swing;
    const beatTimeOffset = beatTime + beatSwingOffset;

    if (cell.note !== null && cell.gain > 0) {
      playSynthNote(cell, beatTimeOffset, destinationNode);
    }

    visualScheduler.push(sequenceIndex, beatTimeOffset);
  };

  visualScheduler.callback = function (value) {
    setIndex(value);
  };

  useEffect(function () {
    if (isPlaying) {
      scheduler.start();
    } else {
      scheduler.stop();
    }
  }, [isPlaying]);

  // stop everything when component is removed.
  useEffect(function () {
    return function () {
      scheduler.stop();
      visualScheduler.stop();
    };
  }, []);

  return [index];
}

function VerticalMeter({ colors, scale }) {
  return (
    <div
      className="flex-auto-basis relative force-layer"
      style={{
        backgroundColor: colors.background
      }}
    >
      <div
        className="absolute absolute--fill"
        style={{
          backgroundColor: colors.foreground,
          transform: `scale3d(1, ${scale}, 1)`,
          transformOrigin: '100% 100%',
          willChange: 'transform'
        }}
      />
    </div>
  );
}

function HiddenContainer({ direction = -1, staggerVisible = 0, isVisible, children }) {
  const yRem = isVisible ? 0 : direction * 2;
  const delayMs = isVisible ? staggerVisible * 198 : 0;

  return (
    <div className="flex-none force-layer">
      <div
        style={{
          opacity: isVisible ? '1' : '0',
          transform: isVisible ? 'translateY(0)' : `translateY(${yRem}rem)`,
          transition: `all 333ms ease-out ${delayMs}ms`,
          willChange: 'opacity, transform'
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KeyLabel({ width = 2, children }) {
  return (
    <div
      className={`flex-none flex justify-center items-center f5 h2 ba br2 b w${width}`}
    >
      {children}
    </div>
  );
}

export default function KeySeq() {
  const destinationNode = useContext(GainContext).gainNode;
  const [bpm, setBpm] = useState(96);
  const [swing, setSwing] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useLocalStorageState('KeySeq.showAdvancedControls', false);

  const [state, dispatch] = useReducer(reducer, initialState);

  const sequence = getCurrentSequence(state);

  const [sequencerIndex] = useSequencer(bpm, swing, isPlaying, sequence, destinationNode);

  const mouseRef = useRef();
  const viewportDimensions = useViewport();
  const [mouseX, mouseY] = useMouse(mouseRef, viewportDimensions);

  const visibleColumnKeys = showAdvancedControls ? columnKeysAdvanced : columnKeys;

  const visibleColumns = useMemo(() => {
    return visibleColumnKeys.map((key, i) => ({
      ...columns[key],
      colors: generateColumnColors(i)
    }));
  }, [visibleColumnKeys]);

  const selectedColumnIndex = inRange(Math.floor(mouseX * visibleColumns.length), 0, visibleColumns.length - 1);
  const selectedColumn = visibleColumns[selectedColumnIndex];
  const selectedColumnValue = selectedColumn.denormalise(mouseY);

  const keyState = getKeyState(state.physicalKeyState, state.keyboardMode);

  useKeyboard(function (code, isDown) {
    const sequenceKeysIndex = sequenceKeys.findIndex(sequenceKey => sequenceKey.code === code);

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
        if (code === 'ArrowLeft') {
          return -1;
        }

        if (code === 'ArrowRight') {
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

    const sequencesIndex = sequencesIndexKeys.findIndex(sequencesIndexKey => sequencesIndexKey.code === code);

    if (showAdvancedControls && (sequencesIndex >= 0 && isDown)) {
      dispatch({
        type: 'selectSequence',
        sequencesIndex: sequencesIndex
      });

      return;
    }

    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      dispatch({
        type: 'setKeyboardMode',
        keyboardMode: isDown ? KEYBOARD_MODE_INVERT : KEYBOARD_MODE_NORMAL,
        selectedColumn,
        selectedColumnValue,
        shouldUpdateSequence: isDown
      });

      return;
    }

    if (code === 'ArrowUp' && isDown) {
      dispatch({
        type: 'randomiseSequence',
        selectedColumn
      });

      return;
    }
  }, [sequenceKeys, state, dispatch, selectedColumn, selectedColumnValue, showAdvancedControls]);

  useEffect(function () {
    dispatch({
      type: 'mouseMove',
      selectedColumn,
      selectedColumnValue
    });
  }, [mouseX, mouseY]);

  return (
    <>
      <div className="absolute absolute--fill flex mv4" ref={mouseRef}>
        {visibleColumns.map(function (column, index) {
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
      <div className="absolute absolute--fill flex flex-column justify-center items-center pointer-events-none dark-gray">
        <div className="f3 tc">
          <p className="ma0 mb2 b">{selectedColumn.label}</p>
          <p className="ma0 mb4 tabular-nums">{selectedColumn.toString(selectedColumnValue)}</p>
        </div>
        <div className="flex box-shadow-1">
          {keyState.map(function (value, index) {
            const cellValue = selectedColumn.normalise(sequence[index][selectedColumn.key]);
            const cellColors = selectedColumn.colors[index % selectedColumn.colors.length];

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

            return (
              <div
                key={index}
                className="relative flex overflow-hidden"
                style={containerStyle}
              >
                <VerticalMeter
                  colors={cellColors}
                  scale={cellValue}
                />
                <div
                  className="absolute absolute--fill flex justify-center items-center f4"
                  style={labelStyle}
                >
                  {sequenceKeys[index].label}
                </div>
              </div>
            );
          })}
        </div>
        <div className="h2" />
        <HiddenContainer direction={1} staggerVisible={1} isVisible={showAdvancedControls}>
          <div className="flex">
            {sequencesIndexKeys.map((sequencesIndexKey, index) => (
              <React.Fragment key={sequencesIndexKey.label}>
                {index > 0 ? <span className="dib w1 flex-none" /> : null}
                <div
                  className="flex-none"
                  style={{
                    opacity: state.sequencesIndex === index ? '1' : '0.25',
                    transform: state.sequencesIndex === index ? 'translate3d(0, 10%, 0)' : '',
                    transition: 'opacity 293ms, transform 153ms',
                    willChange: 'opacity'
                  }}
                >
                  <KeyLabel>{sequencesIndexKey.label}</KeyLabel>
                </div>
              </React.Fragment>
            ))}
          </div>
        </HiddenContainer>
      </div>
      <div className="relative pa3 flex overflow-hidden">
        <ButtonA
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </ButtonA>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <RangeA
            value={bpm}
            disabled={!showAdvancedControls}
            min={40}
            max={160}
            step={1}
            onChange={setBpm}
          >
            BPM: {bpm}
          </RangeA>
        </HiddenContainer>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <RangeA
            value={swing}
            disabled={!showAdvancedControls}
            min={0}
            max={0.7}
            step={0.05}
            onChange={setSwing}
          >
            Swing: {numberToPercentageString(swing)}
          </RangeA>
        </HiddenContainer>
        <span className="dib w2 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <ButtonA
            disabled={!showAdvancedControls || stack.isEmpty(state.undoStack)}
            onClick={() => dispatch({ type: 'popUndo' })}
          >
            Undo
          </ButtonA>
        </HiddenContainer>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <ButtonA
            disabled={!showAdvancedControls || sequence === initialState.sequences[state.sequencesIndex]}
            onClick={() => dispatch({ type: 'resetSequence' })}
          >
            Reset
          </ButtonA>
        </HiddenContainer>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <ButtonA
            onClick={() => dispatch({ type: 'randomiseAll' })}
          >
            Random
          </ButtonA>
        </HiddenContainer>
        <span className="dib w2 flex-auto flex-shrink-0" />
        <GainRange />
      </div>
      <div className="absolute w-100 bottom-0 pa3 flex items-end overflow-hidden">
        <HiddenContainer direction={1} staggerVisible={2} isVisible={!showAdvancedControls}>
          <div
            className="pb4 mid-gray"
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '1rem',
              alignItems: 'center',
              justifyItems: 'center'
            }}
          >
            <KeyLabel width="3">Shift</KeyLabel>
            <p className="ma0 grid-justify-start">Invert</p>
            <KeyLabel>&#8593;</KeyLabel>
            <p className="ma0 grid-justify-start">Randomise</p>
            <KeyLabel>&#8592;</KeyLabel>
            <p className="ma0 grid-justify-start">Move left</p>
            <KeyLabel>&#8594;</KeyLabel>
            <p className="ma0 grid-justify-start">Move right</p>
          </div>
        </HiddenContainer>
        <span className="dib w2 flex-auto flex-shrink-0" />
        <CheckboxA
          checked={showAdvancedControls}
          onChange={() => setShowAdvancedControls(!showAdvancedControls)}
        >
          Advanced
        </CheckboxA>
      </div>
    </>
  );
};
