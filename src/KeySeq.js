import React, { useEffect, useRef, useState } from 'react';
import audioContext from './webaudio/audioContext';
import Scheduler from './webaudio/Scheduler';
import { arraySetAt } from './utils/array';
import VisualScheduler from './webaudio/VisualScheduler';

const emptyCell = {
  gain: 1,
  note: 0
};

const defaultKeyState = new Array(8).fill(false);
const defaultSequence = defaultKeyState.map(_ => emptyCell);

const columns = [
  {
    label: 'Note',
    key: 'note',
    color: 'magenta',
    fromFloat: (y, _cell) => ({ note: Math.round(y * 12) }),
    toFloat: y => y / 12
  },
  {
    label: 'Gain',
    key: 'gain',
    color: 'yellow',
    fromFloat: (y, _cell) => ({ gain: y }),
    toFloat: y => y
  }
];

function useWindowMouse() {
  const [position, setPosition] = useState([0, 0]);

  useEffect(function () {
    const onMouseMove = function (event) {
      const x = event.pageX / window.innerWidth;
      const y = 1 - (event.pageY / window.innerHeight);

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

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    return function () {
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
      const frequency = 440 * Math.pow(2, (cell.note - 1) / 12);

      // create nodes
      const osc = audioContext.createOscillator();
      osc.type = 'square';
      osc.frequency.value = frequency;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = Math.pow(cell.gain, 1.6);

      osc.start(beatTime);
      osc.stop(beatTime + (beatLength * 0.9));

      // routing
      osc.connect(gainNode);
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

function Cell({ label, cell }) {
  return (
    <div className="flex bg-gray absolute absolute--fill">
      {columns.map(function (column, index) {
        return (
          <div
            key={index}
            className="flex-auto"
            style={{
              backgroundColor: column.color,
              transform: `scale3d(1, ${column.toFloat(cell[column.key])}, 1)`,
              transformOrigin: '100% 100%'
            }}
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
          ...selectedColumn.fromFloat(mouseY, cell)
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
          ...selectedColumn.fromFloat(mouseY, cell)
        };
      }

      return cell;
    });

    setSequence(newSequence);
  }, [mouseX, mouseY]);

  return (
    <div className="h-100 relative">
      <div className="w-100 h-100 absolute flex justify-center items-center">
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
