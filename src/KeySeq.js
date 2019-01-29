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

const defaultKeyState = new Array(8).fill(false);
const defaultSequence = defaultKeyState.map(_ => emptyCell);

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

function useKeyState() {
  const [keyStates, setKeyStates] = useState([defaultKeyState, defaultKeyState]);
  const [keyState, previousKeyState] = keyStates;

  useEffect(function () {
    // prevent stuck keys - reset state
    const onWindowBlur = function () {
      setKeyStates(([keyState, _]) => [defaultKeyState, keyState]);
    };

    const onKey = function (event) {
      const keyIndex = event.keyCode - 49;

      if (keyIndex < 0 || keyIndex >= keyState.length) {
        return;
      }

      event.preventDefault();

      const isDown = event.type === 'keydown';

      if (keyState[keyIndex] === isDown) {
        return;
      }

      setKeyStates(([keyState, _]) => [arraySetAt(keyState, keyIndex, isDown), keyState]);
    };

    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    return function () {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [keyStates]);

  return [keyState, previousKeyState];
}

function useSequencer(isPlaying, sequence) {
  const schedulerInstance = useRef(null);
  const visualSchedulerInstance = useRef(null);
  const [index, setIndex] = useState(0);

  if (schedulerInstance.current === null) {
    schedulerInstance.current = new Scheduler();
  }

  if (visualSchedulerInstance.current === null) {
    visualSchedulerInstance.current = new VisualScheduler();
  }

  const scheduler = schedulerInstance.current;
  const visualScheduler = visualSchedulerInstance.current;

  scheduler.callback = function (beatTime, beatLength, index) {
    const sequenceIndex = index % sequence.length;
    const cell = sequence[sequenceIndex];

    if (cell.note > 0 && cell.gain > 0) {
      const scaleIndex = cell.note - 1;
      const scaleNote = scale[scaleIndex];

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

      osc.start(beatTime);
      osc.stop(beatTime + (beatLength * 0.9));

      // routing
      osc.connect(lowpassNode);
      lowpassNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
    }

    visualScheduler.push(sequenceIndex, beatTime);
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
  const [sequence, setSequence] = useState(defaultSequence);
  const [sequencerIndex] = useSequencer(isPlaying, sequence);
  const [mouseX, mouseY] = useWindowMouse();
  const [keyState, previousKeyState] = useKeyState();

  const selectedColumn = columns[Math.floor(mouseX * columns.length)];

  // keyState change
  useEffect(function () {
    keyState.forEach(function (value, index) {
      if (value && !previousKeyState[index]) {
        const cell = sequence[index];

        const newCell = {
          ...cell,
          [selectedColumn.key]: selectedColumn.fromMouse(mouseY)
        };

        setSequence(arraySetAt(sequence, index, newCell));
      }
    });
  }, [keyState, previousKeyState]);

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
