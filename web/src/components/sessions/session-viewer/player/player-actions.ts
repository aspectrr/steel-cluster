import { playerService } from "./player-service";
import * as store from "./player-stores";

export function toggle() {
  playerService.toggle();
}

export function play() {
  const status = store.playerStatusAtom.get();
  if (status === "ended") {
    goto(0, true);
  } else {
    playerService.play();
  }
}

export function pause() {
  playerService.pause();
}

export function goto(timeOffset: number, shouldPlay?: boolean) {
  store.seekingAtom.set(true);
  playerService.goto(timeOffset, shouldPlay).finally(() => {
    store.seekingAtom.set(false);
  });
}

export function setSpeed(newSpeed: number) {
  playerService.setSpeed(newSpeed);
}

export function toggleSkipInactive() {
  playerService.toggleSkipInactive();
}

export function playRange(
  timeOffset: number,
  endTimeOffset: number,
  startLooping = false,
  afterHook?: () => void,
) {
  store.loopAtom.set(
    startLooping ? { start: timeOffset, end: endTimeOffset } : null,
  );
  store.pauseAtAtom.set(endTimeOffset);
  store.onPauseHookAtom.set(afterHook || null);
  playerService.play(timeOffset);
}

export function updateDimensions(width: number, height: number) {
  playerService.updateDimensions(width, height);
}