import React, { useEffect, useRef, useState } from 'react';
import audioContext from './webaudio/audioContext';
import Scheduler from './webaudio/Scheduler';
import { arraySetAt } from './utils/array';
import VisualScheduler from './webaudio/VisualScheduler';

// alternative to using inline self-executing function
const f = (callback) => callback();

const inRange = (value, min, max) => Math.min(max, Math.max(min, value));

const emptyCell = {
  note: 0,
  gain: 1,
  filter: 1
};

const sequenceKeys = ['1', '2', '3', '4', '5', '6', '7', '8'];

const scale = [0, 2, 3, 5, 7, 8, 11]; // harmonic minor

function numberToPercentageString(number) {
  return `${Math.floor(number * 100)}%`;
}

const columns = [
  {
    label: 'Note',
    key: 'note',
    color: 'magenta',
    fromMouse: y => Math.floor(y * (scale.length + 1)),
    toMouse: value => (value / scale.length),
    toString: value => value > 0 ? value.toString() : 'None'
  },
  {
    label: 'Gain',
    key: 'gain',
    color: 'yellow',
    fromMouse: y => y,
    toMouse: value => value,
    toString: numberToPercentageString
  },
  {
    label: 'Filter',
    key: 'filter',
    color: 'beige',
    fromMouse: y => y,
    toMouse: value => value,
    toString: numberToPercentageString
  }
];

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
  const stateRef = useRef(null);

  if (stateRef.current === null) {
    stateRef.current = {};
  }

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

function useSequencer(isPlaying, sequence) {
  const schedulerInstance = useRef(null);
  const visualSchedulerInstance = useRef(null);
  const [index, setIndex] = useState(0);

  if (schedulerInstance.current === null) {
    schedulerInstance.current = new Scheduler(96);
  }

  if (visualSchedulerInstance.current === null) {
    visualSchedulerInstance.current = new VisualScheduler();
  }

  const scheduler = schedulerInstance.current;
  const visualScheduler = visualSchedulerInstance.current;

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

      const gainNode = audioContext.createGain();
      gainNode.gain.value = Math.pow(cell.gain, 1.6);

      osc.start(beatTimeOffset);
      osc.stop(beatTime + (beatLength * 0.9));

      // routing
      osc.connect(lowpassNode);
      lowpassNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
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

function VerticalMeter({ backgroundColor, color, scale, children }) {
  return (
    <div
      className="flex-auto-basis relative flex justify-center items-center"
      style={{
        backgroundColor,
        zIndex: 0
      }}
    >
      <div
        className="absolute absolute--fill"
        style={{
          backgroundColor: color,
          transform: `scale3d(1, ${scale}, 1)`,
          transformOrigin: '100% 100%',
          zIndex: -1
        }}
      />
      {children}
    </div>
  );
}

function Cell({ label, cell }) {
  return (
    <div className="flex bg-gray absolute absolute--fill">
      {columns.map(function (column, index) {
        return (
          <VerticalMeter
            key={index}
            backgroundColor="green"
            color={column.color}
            scale={column.toMouse(cell[column.key])}
          />
        );
      })}
      {label ?
        <div
          className="absolute absolute--fill flex justify-center items-center"
        >
          {label}
        </div>
        :
        null
      }
    </div>
  );
}

export default function KeySeq() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sequence, setSequence] = useState(() => sequenceKeys.map(_ => emptyCell));
  const [keyState, setKeyState] = useState(() => sequenceKeys.map(_ => false));
  const [sequencerIndex] = useSequencer(isPlaying, sequence);
  const [mouseX, mouseY] = useWindowMouse();

  const selectedColumn = columns[Math.floor(mouseX * columns.length)];

  useKeyboard(function (key, isDown) {
    const sequenceKeysIndex = sequenceKeys.indexOf(key);

    if (sequenceKeysIndex >= 0) {
      if (isDown) {
        const cell = sequence[sequenceKeysIndex];

        const newCell = {
          ...cell,
          [selectedColumn.key]: selectedColumn.fromMouse(mouseY)
        };

        // need to use function to access state
        // see https://github.com/facebook/react/issues/14750
        setKeyState(keyState => arraySetAt(keyState, sequenceKeysIndex, true));
        setSequence(sequence => arraySetAt(sequence, sequenceKeysIndex, newCell));
      } else {
        setKeyState(keyState => arraySetAt(keyState, sequenceKeysIndex, false));
      }
    }
  }, [keyState, mouseY, selectedColumn, sequence]);

  // mouse move
  useEffect(function () {
    if (!keyState.find(x => x)) {
      return;
    }

    const newSequence = sequence.map(function (cell, index) {
      if (keyState[index]) {
        return {
          ...cell,
          [selectedColumn.key]: selectedColumn.fromMouse(mouseY)
        };
      }

      return cell;
    });

    setSequence(newSequence);
  }, [mouseX, mouseY]);

  return (
    <div className="h-100 relative">
      <div className="absolute absolute--fill flex">
        {columns.map(function (column, index) {
          const colors = {
            note: ['yellow', 'teal'],
            gain: ['red', 'blue'],
            filter: ['magenta', 'green']
          };

          const [backgroundColor, color, scale, valueString] = f(() => {
            if (column === selectedColumn) {
              const value = column.fromMouse(mouseY);

              return [...colors[column.key], column.toMouse(value), column.toString(value)];
            } else {
              return ["grey", "", 0, null];
            }
          });

          return (
            <VerticalMeter
              key={index}
              backgroundColor={backgroundColor}
              color={color}
              scale={scale}
            >
              {column.label + (valueString ? ' ' + valueString : '')}
            </VerticalMeter>
          );
        })}
      </div>
      <div className="absolute absolute--fill flex justify-center items-center">
        {keyState.map(function (value, index) {
          const scale = sequencerIndex === index ? '1.5' : '1';

          const style = {
            willChange: 'opacity',
            opacity: value ? '1' : '0.2',
            transform: `scale3d(${scale}, ${scale}, 1)`,
            transition: 'transform 173ms'
          };

          return (
            <div
              key={index}
              className="w2 h2 relative"
              style={style}
            >
              <Cell label={index + 1} cell={sequence[index]} />
            </div>
          );
        })}
      </div>
      <div className="relative">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
        >
            {isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>
    </div>
  );
};
