import audioContext from "./audioContext";

const LOOK_AHEAD_SECONDS = 0.2;
const TIMEOUT_MILLISECONDS = 0.14 * 1000;

function update(scheduler, beatTime, index) {
  const targetTime = audioContext.currentTime + LOOK_AHEAD_SECONDS;
  const beatLength = 60 / scheduler.bpm / scheduler.ticksPerBeat;

  while (beatTime < targetTime) {
    scheduler.callback(beatTime, beatLength, index);

    beatTime += beatLength;
    index++;
  }

  scheduler.timeout = window.setTimeout(
    update,
    TIMEOUT_MILLISECONDS,
    scheduler,
    beatTime,
    index
  );
}

const Scheduler = function(bpm = 120, ticksPerBeat = 4) {
  this.bpm = bpm;
  this.ticksPerBeat = ticksPerBeat;

  this.callback = null;
  this.timeout = null;
};

Scheduler.prototype.start = function() {
  if (this.timeout) {
    return;
  }

  update(this, audioContext.currentTime, 0);
};

Scheduler.prototype.stop = function() {
  window.clearTimeout(this.timeout);

  this.timeout = null;
};

export default Scheduler;
