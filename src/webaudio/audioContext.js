const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContext ? new AudioContext() : null;

const userGestureEvents = ["mousedown", "touchend"];

function onNextUserGesture(callback) {
  const onUserGesture = function() {
    userGestureEvents.forEach(key =>
      window.removeEventListener(key, onUserGesture)
    );

    callback();
  };

  userGestureEvents.forEach(key => window.addEventListener(key, onUserGesture));
}

if (audioContext.state === "suspended") {
  onNextUserGesture(function() {
    audioContext.resume();
  });
}

export default audioContext;
