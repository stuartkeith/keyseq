import React, {
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { animated, config, useSpring, useSprings } from "react-spring";
import { ButtonA } from "./components/ButtonA";
import { CheckboxA } from "./components/CheckboxA";
import { GainNodeContext, GainRange } from "./components/GainRange";
import { RangeA } from "./components/RangeA";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useRefLazy } from "./hooks/useRefLazy";
import { useViewport } from "./hooks/useViewport";
import { arrayReplaceAt, arraySetAt, mapRange } from "./utils/array";
import { chain } from "./utils/function";
import { inRange } from "./utils/number";
import * as stack from "./utils/stack";
import audioContext from "./webaudio/audioContext";
import Scheduler from "./webaudio/Scheduler";
import VisualScheduler from "./webaudio/VisualScheduler";

const f = callback => callback();
const passThrough = value => value;

function numberToPercentageString(number) {
  return `${Math.floor(number * 100)}%`;
}

// dynamically generate background/foreground colours for a column.
function generateColumnColorSet(index) {
  const startDegree = 214;
  const degreeStep = 25;
  const saturation = 47;

  const hue = startDegree + degreeStep * index;
  const backgroundLightness = 80;
  const foregroundLightness = 64;

  return {
    background: `hsl(${hue}, ${saturation}%, ${backgroundLightness}%)`,
    foreground: `hsl(${hue}, ${saturation}%, ${foregroundLightness}%)`,
    border: `hsl(${hue}, ${saturation}%, ${foregroundLightness - 9}%)`,
    text: `hsl(${hue}, ${saturation}%, 23%)`
  };
}

const sequenceKeys = [
  { code: "Digit1", label: ["!", "1"] },
  { code: "Digit2", label: ["@", "2"] },
  { code: "Digit3", label: ["#", "3"] },
  { code: "Digit4", label: ["$", "4"] },
  { code: "Digit5", label: ["%", "5"] },
  { code: "Digit6", label: ["^", "6"] },
  { code: "Digit7", label: ["&", "7"] },
  { code: "Digit8", label: ["*", "8"] }
];

const sequencesIndexKeys = [
  { code: "KeyZ", label: "Z" },
  { code: "KeyX", label: "X" },
  { code: "KeyC", label: "C" },
  { code: "KeyV", label: "V" }
];

const KEYBOARD_MODE_NORMAL = "KEYBOARD_MODE_NORMAL";
const KEYBOARD_MODE_INVERT = "KEYBOARD_MODE_INVERT";

// react-transition config for key-based springs (needs to feel responsive
// and snappy).
const springKeyConfig = {
  tension: 910,
  friction: 20
};

const columnKeys = ["note", "octave", "gain", "decay", "waveform"];

const columnKeysAdvanced = [
  ...columnKeys,
  "filterFrequency",
  "filterResonance",
  "lfoGain",
  "lfoFrequency"
];

// column definitions - determines how each column is displayed, its defaults,
// and how values are converted to and from mouse coordinates.
const columns = f(() => {
  const columns = {
    note: {
      label: "Note",
      key: "note",
      ...arrayColumn(
        0,
        [null, 0, 2, 3, 5, 7, 8, 11], // harmonic minor scale
        (value, array) =>
          value === null ? "-" : array.indexOf(value).toString()
      )
    },
    octave: {
      label: "Octave",
      key: "octave",
      ...integerColumn(0, -2, 2, value => `${value >= 0 ? "+" : ""}${value}`)
    },
    gain: {
      label: "Gain",
      key: "gain",
      ...numberColumn(1, 0.4, 1, numberToPercentageString)
    },
    filterFrequency: {
      label: "Filter Frequency",
      key: "filterFrequency",
      defaultValue: 1,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    filterResonance: {
      label: "Filter Resonance",
      key: "filterResonance",
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    lfoFrequency: {
      label: "LFO Frequency",
      key: "lfoFrequency",
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    lfoGain: {
      label: "LFO Gain",
      key: "lfoGain",
      defaultValue: 0,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    decay: {
      label: "Decay",
      key: "decay",
      defaultValue: 0.5,
      denormalise: passThrough,
      normalise: passThrough,
      toString: numberToPercentageString
    },
    waveform: {
      label: "Waveform",
      key: "waveform",
      ...arrayColumn(0, ["sawtooth", "square", "sine"], passThrough)
    }
  };

  return columns;

  // helper to create a column that represents a specific value within an array.
  function arrayColumn(defaultIndex, array, toString) {
    return {
      defaultValue: array[defaultIndex],
      denormalise: normalisedValue => {
        // convert 0 to 1 to array value
        const arrayIndex = inRange(
          Math.floor(normalisedValue * array.length),
          0,
          array.length - 1
        );

        return array[arrayIndex];
      },
      normalise: value => {
        // convert value in array to 0 to 1
        const index = array.indexOf(value);

        if (index < 0) {
          throw new Error("Invalid cell value");
        }

        return (index + 1) / array.length;
      },
      toString: value => toString(value, array)
    };
  }

  // helper to create a column that represents an integer value.
  function integerColumn(defaultValue, minValue, maxValue, toString) {
    const range = maxValue - minValue + 1;

    return {
      defaultValue,
      denormalise: normalisedValue => {
        return inRange(
          minValue + Math.floor(normalisedValue * range),
          minValue,
          maxValue
        );
      },
      normalise: value => {
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
      denormalise: normalisedValue => {
        return minValue + range * normalisedValue;
      },
      normalise: value => {
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
    mouseX: 0,
    mouseY: 0,
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
        throw new Error("invalid keyboardMode - " + keyboardMode);
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
      sequences: mapCurrentSequence(state, function(cell, index) {
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
  function getNewStateFromKeyChange(
    state,
    nextPhysicalKeyState,
    nextKeyboardMode
  ) {
    const existingKeyState = getKeyState(
      state.physicalKeyState,
      state.keyboardMode
    );
    const existingKeyCount = getKeyCount(existingKeyState);

    const nextKeyState = getKeyState(nextPhysicalKeyState, nextKeyboardMode);
    const nextKeyCount = getKeyCount(nextKeyState);

    const isFirstKeyDown = existingKeyCount === 0 && nextKeyCount > 0;
    const isLastKeyDown = existingKeyCount > 0 && nextKeyCount === 0;

    // if this is the first key down, store the existing sequences state to push
    // to the undo stack later.
    const sequencesBeforeCurrentEdit = isFirstKeyDown
      ? state.sequences
      : state.sequencesBeforeCurrentEdit;
    // or if this is the last key down, push that stored sequences state to the
    // undo stack.
    const undoStack = isLastKeyDown
      ? stack.push(state.undoStack, state.sequencesBeforeCurrentEdit)
      : state.undoStack;

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
      case "resetAll":
        return {
          ...state,
          sequences: initialState.sequences,
          undoStack: initialState.undoStack
        };
      case "resetSequence":
        return {
          ...state,
          sequences: replaceCurrentSequence(state, _ => emptySequence),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case "selectSequence":
        return {
          ...state,
          sequencesIndex: action.sequencesIndex
        };
      case "setKeyboardMode":
        return chain(
          state,
          state =>
            getNewStateFromKeyChange(
              state,
              state.physicalKeyState,
              action.keyboardMode
            ),
          action.shouldUpdateSequence
            ? state => updateSequenceWithAction(state, action)
            : passThrough
        );
      case "keyDown":
        return chain(
          state,
          state =>
            getNewStateFromKeyChange(
              state,
              arraySetAt(
                state.physicalKeyState,
                action.sequenceKeysIndex,
                true
              ),
              state.keyboardMode
            ),
          state => updateSequenceWithAction(state, action)
        );
      case "keyUp":
        return getNewStateFromKeyChange(
          state,
          arraySetAt(state.physicalKeyState, action.sequenceKeysIndex, false),
          state.keyboardMode
        );
      case "mouseMove":
        return chain(
          state,
          state => updateSequenceWithAction(state, action),
          state => ({ ...state, mouseX: action.x, mouseY: action.y })
        );
      case "shiftSequence":
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
        const startIndex =
          action.direction < 0 ? boundOffset : sequence.length - boundOffset;

        return {
          ...state,
          sequences: mapCurrentSequence(state, function(cell, index) {
            const targetIndex = (index + startIndex) % sequence.length;

            return {
              ...cell,
              [columnKey]: sequence[targetIndex][columnKey]
            };
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case "randomiseAll":
        return {
          ...state,
          sequences: mapCurrentSequence(state, function() {
            return createCell(column => column.denormalise(Math.random()));
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case "randomiseSequence":
        const keyState = getKeyState(
          state.physicalKeyState,
          state.keyboardMode
        );
        const anyKeysAreDown = !!keyState.find(x => x);

        return {
          ...state,
          sequences: mapCurrentSequence(state, function(cell, index) {
            if (anyKeysAreDown && !keyState[index]) {
              return cell;
            }

            return {
              ...cell,
              [action.selectedColumn.key]: action.selectedColumn.denormalise(
                Math.random()
              )
            };
          }),
          undoStack: stack.push(state.undoStack, state.sequences)
        };
      case "popUndo":
        if (stack.isEmpty(state.undoStack)) {
          return state;
        }

        return {
          ...state,
          sequences: stack.read(state.undoStack),
          undoStack: stack.pop(state.undoStack)
        };
      default:
        throw new Error("Unrecognised action type - " + action.type);
    }
  }
});

// a hook that listens to the window's mousemove events and returns mouse
// coordinates relative to the specified element, normalised to a range of 0
// to 1.
function useMouse(elementRef, viewportDimensions, callback) {
  const elementOffset = useRef();
  const callbackRef = useRef();

  callbackRef.current = callback;

  // only remeasure the element when the viewport is resized.
  // we can use a ref here as the new values are only needed on the next
  // mouse event.
  useEffect(
    function() {
      const boundingClientRect = elementRef.current.getBoundingClientRect();

      elementOffset.current = [
        boundingClientRect.left + window.pageXOffset,
        boundingClientRect.top + window.pageYOffset,
        boundingClientRect.width,
        boundingClientRect.height
      ];
    },
    [elementRef, viewportDimensions.width, viewportDimensions.height]
  );

  useEffect(function() {
    const onMouseMove = function(event) {
      const [
        elementX,
        elementY,
        elementWidth,
        elementHeight
      ] = elementOffset.current;

      const offsetX = event.pageX - elementX;
      const offsetY = event.pageY - elementY;

      const x = inRange(offsetX / elementWidth, 0, 1);
      const y = inRange(offsetY / elementHeight, 0, 1);

      callbackRef.current(x, y);
    };

    window.addEventListener("mousemove", onMouseMove);

    return function() {
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);
}

// a hook that listens to the window's keyboard events, ignoring repeated
// keydown events. also handles the window losing focus while keys are being
// held, to avoid stuck keys.
function useKeyboard(callback) {
  const stateRef = useRef({});
  const state = stateRef.current;
  const callbackRef = useRef();

  callbackRef.current = callback;

  useEffect(
    function() {
      const onWindowBlur = function() {
        Object.keys(state).forEach(function(key) {
          if (state[key]) {
            state[key] = false;

            callbackRef.current(key, false);
          }
        });
      };

      const onKeyDown = function(event) {
        if (state[event.code] === true) {
          return;
        }

        state[event.code] = true;

        callbackRef.current(event.code, true);
      };

      const onKeyUp = function(event) {
        state[event.code] = false;

        callbackRef.current(event.code, false);
      };

      window.addEventListener("blur", onWindowBlur);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      return function() {
        window.removeEventListener("blur", onWindowBlur);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    },
    [state]
  );
}

function playSynthNote(cell, startTime, destinationNode) {
  // create nodes.
  const osc = f(() => {
    const scaleNote = cell.note + cell.octave * 12 - 12;
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
    const filterLogScale =
      filterMin +
      filterRange * Math.pow(2, filterLog * (cell.filterFrequency - 1));

    const lowpassNode = audioContext.createBiquadFilter();
    lowpassNode.type = "lowpass";
    lowpassNode.frequency.value = filterLogScale;
    lowpassNode.Q.value = cell.filterResonance * 30;

    return lowpassNode;
  });

  const gainNode = audioContext.createGain();

  const lfo = audioContext.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = cell.lfoFrequency * 17;

  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = cell.lfoGain * 25;

  // set values that change over time.
  const stopTime = f(() => {
    const decayTime = 0.06 + cell.decay * 3;

    // increment inline as we go, so the value is relative to the previous
    // value. as a bonus, the final value after fade out will then indicate the
    // time the note can be inaudibly stopped.
    let currentTime = startTime;

    gainNode.gain.setValueAtTime(Math.pow(cell.gain, 1.6), currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      (currentTime += decayTime)
    );

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

  scheduler.callback = function(beatTime, beatLength, index) {
    const sequenceIndex = index % sequence.length;
    const cell = sequence[sequenceIndex];
    const beatSwingOffset = sequenceIndex % 2 ? 0 : beatLength * swing;
    const beatTimeOffset = beatTime + beatSwingOffset;

    if (cell.note !== null && cell.gain > 0) {
      playSynthNote(cell, beatTimeOffset, destinationNode);
    }

    visualScheduler.push(sequenceIndex, beatTimeOffset);
  };

  visualScheduler.callback = function(value) {
    setIndex(value);
  };

  useEffect(
    function() {
      if (isPlaying) {
        scheduler.start();
      } else {
        scheduler.stop();
      }
    },
    [scheduler, isPlaying]
  );

  // stop everything when component is removed.
  useEffect(
    function() {
      return function() {
        scheduler.stop();
        visualScheduler.stop();
      };
    },
    [scheduler, visualScheduler]
  );

  return [index];
}

const VerticalMeter = forwardRef(
  ({ className = "", style, colors, scale }, ref) => {
    return (
      <div
        ref={ref}
        className={`force-layer ${className}`}
        style={{
          ...style,
          backgroundColor: colors.background
        }}
      >
        <div
          className="absolute absolute--fill"
          style={{
            backgroundColor: colors.foreground,
            transform: `scale3d(1, ${scale}, 1)`,
            transformOrigin: "100% 100%",
            willChange: "transform"
          }}
        />
      </div>
    );
  }
);

const AnimatedVerticalMeter = animated(VerticalMeter);

function HiddenContainer({
  className = "",
  direction = -1,
  staggerVisible = 0,
  isVisible,
  children
}) {
  // the normal useSpring will be reset on re-render, which is a problem during
  // playback - the delay means updates are continually queued. use this form
  // instead and update only when props have changed.
  const [props, set] = useSpring(() => ({
    value: isVisible ? 1 : 0,
    config: config.wobbly
  }));

  useEffect(
    function() {
      set({
        delay: isVisible ? staggerVisible * 312 : 0,
        value: isVisible ? 1 : 0
      });
    },
    [set, isVisible, staggerVisible]
  );

  return (
    <div className={`flex-none ${className}`}>
      <animated.div
        style={{
          opacity: props.value,
          transform: props.value.interpolate(
            value => `translateY(${(1 - value) * 2 * direction}rem)`
          ),
          willChange: "opacity, transform"
        }}
      >
        {children}
      </animated.div>
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

function KeyHint({ columnColors, keyLabel }) {
  const keyLabelCopy = useRef();

  // always show the last non-falsey value, to avoid it disappearing while
  // transitioning out.
  if (keyLabel) {
    keyLabelCopy.current = keyLabel;
  }

  // the normal useSpring will be reset on re-render, which is a problem during
  // playback - the delay means updates are continually queued. use this form
  // instead and update only when props have changed.
  const [props, set] = useSpring(() => ({
    from: {
      opacity: keyLabel ? 1 : 0
    },
    to: {
      opacity: keyLabel ? 1 : 0
    }
  }));

  useEffect(
    function() {
      set({
        opacity: keyLabel ? 1 : 0
      });
    },
    [set, keyLabel]
  );

  const color = columnColors.background;

  return (
    <animated.div
      className="tl f5 pa3 box-shadow-1 ml-auto mr-auto mt4 relative"
      style={{
        backgroundColor: color,
        opacity: props.opacity,
        visibility: props.opacity.interpolate(x =>
          x > 0 ? "visible" : "hidden"
        )
      }}
    >
      <p className="ma0">
        Hold the <span className="b tabular-nums">{keyLabelCopy.current}</span>{" "}
        key on your keyboard and move the mouse!
      </p>
    </animated.div>
  );
}

export default function KeySeq() {
  const destinationNode = useContext(GainNodeContext);
  const [bpm, setBpm] = useState(96);
  const [swing, setSwing] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useLocalStorageState(
    "KeySeq.showAdvancedControls",
    false
  );
  const [keyLabelClicked, setKeyLabelClicked] = useState(null);

  const [state, dispatch] = useReducer(reducer, initialState);

  const sequence = getCurrentSequence(state);

  const [sequencerIndex] = useSequencer(
    bpm,
    swing,
    isPlaying,
    sequence,
    destinationNode
  );

  const mouseRef = useRef();
  const viewportDimensions = useViewport();

  const maxColumnCount = Math.max(columnKeys.length, columnKeysAdvanced.length);
  const minColumnCount = Math.min(columnKeys.length, columnKeysAdvanced.length);
  const visibleColumnKeys = showAdvancedControls
    ? columnKeysAdvanced
    : columnKeys;
  const visibleColumnCount = visibleColumnKeys.length;

  const visibleColumns = useMemo(
    () => visibleColumnKeys.map(key => columns[key]),
    [visibleColumnKeys]
  );

  const getSelectedColumnInfoAtMouse = function(x, y) {
    const selectedColumnIndex = inRange(
      Math.floor(x * visibleColumnCount),
      0,
      visibleColumnCount - 1
    );
    const selectedColumn = visibleColumns[selectedColumnIndex];
    const selectedColumnValue = selectedColumn.denormalise(1 - y);

    return {
      selectedColumnIndex,
      selectedColumn,
      selectedColumnValue
    };
  };

  const columnColors = useMemo(() => {
    return mapRange(maxColumnCount, index => generateColumnColorSet(index));
  }, [maxColumnCount]);

  // we want to only animate the vertical meters' transform in order to avoid
  // repaints, for smooth animation. so set their width to be wide enough to be
  // rendered without gaps when the least number of meters are shown.
  // add a bit extra to account for the wobbly transition overshoot.
  const verticalMeterWidth = Math.ceil(
    (viewportDimensions.width / minColumnCount) * 1.25
  );
  // then the transform will be based off this offset.
  const verticalMeterOffset = viewportDimensions.width / visibleColumnCount;

  const {
    selectedColumnIndex,
    selectedColumn,
    selectedColumnValue
  } = getSelectedColumnInfoAtMouse(state.mouseX, state.mouseY);

  const keyState = getKeyState(state.physicalKeyState, state.keyboardMode);

  useMouse(mouseRef, viewportDimensions, function(x, y) {
    dispatch({
      type: "mouseMove",
      x,
      y,
      ...getSelectedColumnInfoAtMouse(x, y)
    });
  });

  useKeyboard(
    function(code, isDown) {
      const sequenceKeysIndex = sequenceKeys.findIndex(
        sequenceKey => sequenceKey.code === code
      );

      if (sequenceKeysIndex >= 0) {
        if (isDown) {
          if (keyLabelClicked) {
            setKeyLabelClicked(null);
          }

          dispatch({
            type: "keyDown",
            sequenceKeysIndex,
            selectedColumn,
            selectedColumnValue
          });
        } else {
          dispatch({
            type: "keyUp",
            sequenceKeysIndex
          });
        }

        return;
      }

      const direction = f(() => {
        if (isDown) {
          if (code === "ArrowLeft") {
            return -1;
          }

          if (code === "ArrowRight") {
            return 1;
          }
        }

        return 0;
      });

      if (direction !== 0) {
        dispatch({
          type: "shiftSequence",
          selectedColumn,
          direction
        });

        return;
      }

      const sequencesIndex = sequencesIndexKeys.findIndex(
        sequencesIndexKey => sequencesIndexKey.code === code
      );

      if (showAdvancedControls && (sequencesIndex >= 0 && isDown)) {
        dispatch({
          type: "selectSequence",
          sequencesIndex: sequencesIndex
        });

        return;
      }

      if (code === "ShiftLeft" || code === "ShiftRight") {
        dispatch({
          type: "setKeyboardMode",
          keyboardMode: isDown ? KEYBOARD_MODE_INVERT : KEYBOARD_MODE_NORMAL,
          selectedColumn,
          selectedColumnValue,
          shouldUpdateSequence: isDown
        });

        return;
      }

      if (code === "ArrowUp" && isDown) {
        dispatch({
          type: "randomiseSequence",
          selectedColumn
        });

        return;
      }
    },
    [
      sequenceKeys,
      state,
      dispatch,
      selectedColumn,
      selectedColumnValue,
      showAdvancedControls,
      keyLabelClicked
    ]
  );

  const columnProps = useSpring({
    immediate: !viewportDimensions.hasTimedOut,
    verticalMeterOffset,
    config: {
      tension: 120,
      friction: 12
    }
  });

  const keyStateProps = useSprings(
    keyState.length,
    keyState.map(value => ({
      y: value ? 1 : 0,
      config: springKeyConfig
    }))
  );

  const sequencesIndexKeyProps = useSprings(
    sequencesIndexKeys.length,
    sequencesIndexKeys.map((_, i) => ({
      y: state.sequencesIndex === i ? 1 : 0,
      config: springKeyConfig
    }))
  );

  return (
    <div
      className="absolute absolute--fill mv4 flex flex-column dark-gray overflow-hidden"
      ref={mouseRef}
    >
      {mapRange(maxColumnCount, function(columnIndex) {
        const column = visibleColumns[columnIndex];
        const colors = columnColors[columnIndex];
        const scale =
          column === selectedColumn
            ? selectedColumn.normalise(selectedColumnValue)
            : 0;

        return (
          <AnimatedVerticalMeter
            key={columnIndex}
            className="absolute left-0 h-100"
            colors={colors}
            scale={scale}
            style={{
              transform: columnProps.verticalMeterOffset.interpolate(
                value => `translateX(${value * columnIndex}px)`
              ),
              width: verticalMeterWidth
            }}
          />
        );
      })}
      <div className="flex-none flex pa3 w-100 relative">
        <ButtonA onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? "Stop" : "Play"}
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
            onClick={() => dispatch({ type: "popUndo" })}
          >
            Undo
          </ButtonA>
        </HiddenContainer>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <ButtonA
            disabled={
              !showAdvancedControls ||
              sequence === initialState.sequences[state.sequencesIndex]
            }
            onClick={() => dispatch({ type: "resetSequence" })}
          >
            Reset
          </ButtonA>
        </HiddenContainer>
        <span className="dib w1 flex-none" />
        <HiddenContainer isVisible={showAdvancedControls}>
          <ButtonA
            disabled={!showAdvancedControls}
            onClick={() => dispatch({ type: "randomiseAll" })}
          >
            Random
          </ButtonA>
        </HiddenContainer>
        <span className="dib w2 flex-auto flex-shrink-0" />
        <GainRange />
      </div>
      <div className="flex-auto h-100 f3 tc pointer-events-none relative flex flex-column justify-end">
        <p className="ma0 mb2 b">{selectedColumn.label}</p>
        <p className="ma0 mb4 tabular-nums">
          {selectedColumn.toString(selectedColumnValue)}
        </p>
      </div>
      <div className="flex-none flex justify-center relative">
        {keyState.map(function(value, index) {
          const cellValue = selectedColumn.normalise(
            sequence[index][selectedColumn.key]
          );
          const cellColors = columnColors[selectedColumnIndex];
          const props = keyStateProps[index];
          const sequenceKey = sequenceKeys[index];

          return (
            <React.Fragment key={index}>
              {index > 0 ? <span className="dib w1 flex-none" /> : null}
              <animated.div
                className="relative flex b justify-center items-center f4 ba bw1 br2 overflow-hidden"
                style={{
                  borderColor: cellColors.border,
                  color: cellColors.text,
                  width: "66px",
                  height: "66px",
                  opacity: index === sequencerIndex ? "1" : "0.55",
                  transform: props.y.interpolate(
                    value => `translateY(${value * 6}px)`
                  ),
                  willChange: "opacity, transform"
                }}
                onClick={() => setKeyLabelClicked(sequenceKey.label[1])}
              >
                <VerticalMeter
                  className="absolute absolute--fill"
                  colors={cellColors}
                  scale={cellValue}
                />
                <span className="relative tc lh-title pointer-events-none">
                  {sequenceKey.label[0]}
                  <br />
                  {sequenceKey.label[1]}
                </span>
              </animated.div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex flex-column flex-auto h-100 relative">
        <KeyHint
          columnColors={columnColors[selectedColumnIndex]}
          keyLabel={keyLabelClicked}
        />
        <HiddenContainer
          direction={1}
          staggerVisible={1}
          isVisible={showAdvancedControls}
        >
          <div className="mt4 flex justify-center pointer-events-none">
            {sequencesIndexKeys.map((sequencesIndexKey, index) => {
              const props = sequencesIndexKeyProps[index];

              return (
                <React.Fragment key={sequencesIndexKey.label}>
                  {index > 0 ? <span className="dib w1 flex-none" /> : null}
                  <animated.div
                    className="flex-none"
                    style={{
                      opacity: props.y.interpolate({
                        output: [0.25, 1],
                        extrapolate: "clamp"
                      }),
                      transform: props.y.interpolate(
                        value => `translateY(${value * 10}%)`
                      ),
                      willChange: "opacity, transform"
                    }}
                  >
                    <KeyLabel>{sequencesIndexKey.label}</KeyLabel>
                  </animated.div>
                </React.Fragment>
              );
            })}
          </div>
        </HiddenContainer>
      </div>
      <div className="flex-none flex items-end pa3">
        <HiddenContainer
          className="absolute"
          direction={1}
          staggerVisible={1}
          isVisible={!showAdvancedControls}
        >
          <div
            className="mid-gray"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "1rem",
              alignItems: "center",
              justifyItems: "center"
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
    </div>
  );
}
