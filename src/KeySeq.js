import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useRefLazy } from './effects/useRefLazy';
import { arrayReplaceAt, arraySetAt } from './utils/array';
import { f } from './utils/f';
import audioContext from './webaudio/audioContext';
import Scheduler from './webaudio/Scheduler';
import VisualScheduler from './webaudio/VisualScheduler';

const passThrough = value => value;

const inRange = (value, min, max) => Math.min(max, Math.max(min, value));

const sequenceKeys = ['1', '2', '3', '4', '5', '6', '7', '8'];

const scale = [0, 2, 3, 5, 7, 8, 11]; // harmonic minor

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

const columns = [
  {
    label: 'Note',
    key: 'note',
    defaultValue: 0,
    colors: generateColumnColors(0),
    denormalise: y => Math.floor(y * (scale.length + 1)),
    normalise: value => (value / scale.length),
    toString: value => value > 0 ? value.toString() : '-'
  },
  {
    label: 'Gain',
    key: 'gain',
    defaultValue: 1,
    colors: generateColumnColors(1),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'Filter',
    key: 'filter',
    defaultValue: 1,
    colors: generateColumnColors(2),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  },
  {
    label: 'Decay',
    key: 'decay',
    defaultValue: 0.5,
    colors: generateColumnColors(3),
    denormalise: passThrough,
    normalise: passThrough,
    toString: numberToPercentageString
  }
];

const emptyCell = f(() => {
  const cell = {};

  columns.forEach(column => cell[column.key] = column.defaultValue);

  return cell;
});

const initialState = {
  keyState: sequenceKeys.map(_ => false),
  sequence: sequenceKeys.map(_ => emptyCell)
};

function reducer(state, action) {
  switch (action.type) {
    case 'keyDown':
      return {
        ...state,
        keyState: arraySetAt(state.keyState, action.sequenceKeysIndex, true),
        sequence: arrayReplaceAt(state.sequence, action.sequenceKeysIndex, cell => ({
          ...cell,
          [action.selectedColumn.key]: action.selectedColumnValue
        }))
      };
    case 'keyUp':
      return {
        ...state,
        keyState: arraySetAt(state.keyState, action.sequenceKeysIndex, false)
      };
    case 'mouseMove':
      // no need to process if no keys held down
      if (!state.keyState.find(x => x)) {
        return state;
      }

      return {
        ...state,
        sequence: state.sequence.map((cell, index) => {
          if (!state.keyState[index]) {
            return cell;
          }

          return {
            ...cell,
            [action.selectedColumn.key]: action.selectedColumnValue
          }
        })
      }
    default:
      throw new Error();
  }
}

function useWindowMouse() {
  const [position, setPosition] = useState([0, 0]);

  useEffect(function () {
    const onMouseMove = function (event) {
      const x = inRange(event.pageX / window.innerWidth, 0, 1);
      const y = inRange(1 - (event.pageY / window.innerHeight), 0, 1);

      setPosition([x, y]);
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
      if (state[event.key] === true) {
        return;
      }

      state[event.key] = true;

      callback(event.key, true);
    };

    const onKeyUp = function (event) {
      state[event.key] = false;

      callback(event.key, false);
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

function useSequencer(isPlaying, sequence, destinationNode) {
  const [index, setIndex] = useState(0);

  const scheduler = useRefLazy(() => new Scheduler(96));
  const visualScheduler = useRefLazy(() => new VisualScheduler());

  scheduler.callback = function (beatTime, beatLength, index) {
    const sequenceIndex = index % sequence.length;
    const cell = sequence[sequenceIndex];
    const beatTimeOffset = beatTime + (sequenceIndex % 2 ? 0 : beatLength * 0.3);

    if (cell.note > 0 && cell.gain > 0) {
      const scaleIndex = cell.note - 1;
      const scaleNote = scale[scaleIndex] - 12;

      const frequency = 440 * Math.pow(2, scaleNote / 12);

      // create nodes
      const osc = audioContext.createOscillator();
      osc.type = 'square';
      osc.frequency.value = frequency;

      const filterMin = 100;
      const filterMax = 22000;
      const filterRange = filterMax - filterMin;
      const filterLog = Math.log2(filterMax / filterMin);
      const filterLogScale = filterMin + (filterRange * Math.pow(2, filterLog * (cell.filter - 1)));

      const lowpassNode = audioContext.createBiquadFilter();
      lowpassNode.type = 'lowpass';
      lowpassNode.frequency.value = filterLogScale;

      const noteTime = 0.1 + (cell.decay * 3);

      const gainNode = audioContext.createGain();

      gainNode.gain.setValueAtTime(Math.pow(cell.gain, 1.6), beatTimeOffset);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, beatTimeOffset + noteTime);

      osc.start(beatTimeOffset);
      osc.stop(beatTimeOffset + noteTime);

      // routing
      osc.connect(lowpassNode);
      lowpassNode.connect(gainNode);
      gainNode.connect(destinationNode);
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

export default function KeySeq({ destinationNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sequencerIndex] = useSequencer(isPlaying, state.sequence, destinationNode);
  const [mouseX, mouseY] = useWindowMouse();

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
    }
  }, [state.keyState, mouseY, selectedColumn, state.sequence]);

  // mouse move
  useEffect(function () {
    dispatch({
      type: 'mouseMove',
      selectedColumn,
      selectedColumnValue
    });
  }, [mouseX, mouseY]);

  return (
    <div className="h-100 relative">
      <div className="absolute absolute--fill flex">
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
        <div className="dark-grey f3 tc">
          <p className="ma0 mb2 dark-gray b">{selectedColumn.label}</p>
          <p className="ma0 mb4 dark-gray">{selectedColumn.toString(selectedColumnValue)}</p>
        </div>
        <div className="flex box-shadow-1">
          {state.keyState.map(function (value, index) {
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
                  {sequenceKeys[index]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative pa3 flex">
        <button
          className="input-reset bg-white dark-gray dib bw0 w3 pa2 box-shadow-1"
          onClick={() => setIsPlaying(!isPlaying)}
        >
            {isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>
    </div>
  );
};
