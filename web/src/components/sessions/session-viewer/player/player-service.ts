import { unpack } from "@rrweb/packer/unpack";
import { Replayer } from "@rrweb/replay";
import { EventType, eventWithTime } from "@rrweb/types";
import * as store from "./player-stores";
import type { RRwebPlayerOptions } from "./player-types";
import { getInactivePeriods } from "./player-utils";

let replayer: Replayer | null = null;
let animationFrameId: number | null = null;
let isFetchingNextChunk = false;
let onBufferEndCallback:
  | (() => Promise<eventWithTime[] | undefined>)
  | null = null;
let serviceTags: Record<string, string> = {};
let serviceInactiveColor = "#00000023";
let hasMoreChunks = true;
let playerElement: HTMLDivElement | null = null;
let skipInactiveSpeed = 16;

const CONTROLLER_HEIGHT = 80;

function stopMainLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

async function fetchNextChunk(): Promise<boolean> {
  if (!onBufferEndCallback || !hasMoreChunks || !replayer) return false;
  try {
    const newEvents = await onBufferEndCallback();
    if (newEvents && newEvents.length > 0) {
      newEvents.forEach((event) => replayer!.addEvent(event));
      recalculateDerivedData(serviceTags, serviceInactiveColor);
      return true;
    } else {
      hasMoreChunks = false;
      return false;
    }
  } catch (error) {
    hasMoreChunks = false;
    return false;
  }
}

function mainLoop() {
  if (!replayer || !playerElement || !document.body.contains(playerElement)) {
    stopMainLoop();
    return;
  }

  const currentTime = replayer.getCurrentTime();
  const meta = replayer.getMetaData();
  const totalTime = meta.totalTime;
  const desiredStatus = store.playerStatusAtom.get();
  const currentReplayerStatus = replayer.service.state.value;

  store.metaDataAtom.set(meta);
  store.currentTimeAtom.set(currentTime);

  const BUFFER_THRESHOLD_MS = 5000 * store.speedAtom.get();
  if (
    hasMoreChunks &&
    !isFetchingNextChunk &&
    totalTime - currentTime < BUFFER_THRESHOLD_MS
  ) {
    isFetchingNextChunk = true;
    fetchNextChunk().finally(() => {
      isFetchingNextChunk = false;
    });
  }

  if (currentTime >= totalTime && isFetchingNextChunk) {
    if (currentReplayerStatus === "playing") {
      replayer.pause();
    }
    store.bufferingAtom.set(true);
  } else if (currentTime >= totalTime && !hasMoreChunks) {
    const approximateTotalTime = store.approximateTotalTimeAtom.get();
    if (approximateTotalTime && approximateTotalTime > totalTime) {
      store.currentTimeAtom.set(approximateTotalTime);
    }
    store.playerStatusAtom.set("ended");
  } else if (!store.bufferingAtom.get()) {
    if (desiredStatus === "playing" && currentReplayerStatus !== "playing") {
      replayer.play(currentTime);
    } else if (
      (desiredStatus === "paused" || desiredStatus === "ended") &&
      currentReplayerStatus === "playing"
    ) {
      replayer.pause();
    }
  }

  const shouldSkip = store.skipInactiveAtom.get();
  const inactivePeriods = store.inactivePeriodsAtom.get();
  const userSpeed = store.speedAtom.get();

  let inInactivePeriod = false;
  if (shouldSkip && desiredStatus === "playing" && meta.startTime) {
    for (const period of inactivePeriods) {
      const relativeStart = period.start - meta.startTime;
      const relativeEnd = period.end - meta.startTime;
      if (currentTime >= relativeStart && currentTime < relativeEnd) {
        inInactivePeriod = true;
        break;
      }
    }
  }

  const targetSpeed = inInactivePeriod ? skipInactiveSpeed : userSpeed;
  if (replayer.config.speed !== targetSpeed) {
    replayer.setConfig({ speed: targetSpeed });
  }
  store.speedStateAtom.set(inInactivePeriod ? "skipping" : "normal");

  animationFrameId = requestAnimationFrame(mainLoop);
}

function updateScale(
  wrapper: HTMLElement,
  dimension: { width: number; height: number },
) {
  const { width, height } = store.playerDimensionsAtom.get();
  const maxScale = store.maxScaleAtom.get();
  const widthScale = width / dimension.width;
  const heightScale = height / dimension.height;
  const scaleFactors = [widthScale, heightScale];
  if (maxScale) scaleFactors.push(maxScale);
  wrapper.style.transform =
    `scale(${Math.min(...scaleFactors)})` + " translate(-50%, -50%)";
}

function recalculateDerivedData(
  tags: Record<string, string>,
  inactiveColor: string,
) {
  if (!replayer) return;

  const meta = replayer.getMetaData();
  const events = replayer.service.state.context.events;

  const { startTime } = meta;
  const replayerDuration = meta.endTime - startTime;
  const displayDuration = Math.max(
    replayerDuration,
    store.approximateTotalTimeAtom.get() ?? 0,
  );

  if (displayDuration === 0) {
    store.customEventsAtom.set([]);
    store.inactivePeriodsAtom.set([]);
    return;
  }

  const position = (timestamp: number) => {
    return `${((timestamp - startTime) / displayDuration) * 100}%`;
  };

  const customEvents = events
    .filter((e) => e.type === EventType.Custom)
    .map((event) => ({
      name: event.data.tag as string,
      background: tags[event.data.tag as string] || "rgb(73, 80, 246)",
      position: position(event.timestamp),
    }));
  store.customEventsAtom.set(customEvents);

  try {
    const periods = getInactivePeriods(
      events,
      replayer.config.inactivePeriodThreshold,
    );
    const getWidth = (start: number, end: number) =>
      `${((end - start) / displayDuration) * 100}%`;

    const inactivePeriods = periods.map((period) => ({
      name: "inactive period",
      background: inactiveColor,
      position: position(period[0]),
      width: getWidth(period[0], period[1]),
      start: period[0],
      end: period[1],
    }));
    store.inactivePeriodsAtom.set(inactivePeriods);
  } catch (e) {
    console.error("Failed to calculate inactive periods:", e);
    store.inactivePeriodsAtom.set([]);
  }
}

export const playerService = {
  init(
    options: Omit<RRwebPlayerOptions["props"], "width" | "height"> & {
      containerEl: HTMLDivElement;
      frameEl: HTMLDivElement;
      playerEl: HTMLDivElement;
      onBufferEnd?: () => Promise<eventWithTime[] | undefined>;
      skipInactiveSpeed?: number;
    },
  ) {
    const {
      containerEl,
      frameEl,
      playerEl,
      events,
      maxScale = 1,
      autoPlay = true,
      speed = 1,
      skipInactive = true,
      skipInactiveSpeed: speedForSkipping = 16,
      showController = true,
      tags = {},
      inactiveColor = serviceInactiveColor,
      onBufferEnd,
      approximateTotalTime,
      ...replayerProps
    } = options;

    playerElement = playerEl;
    skipInactiveSpeed = speedForSkipping;

    serviceTags = tags;
    serviceInactiveColor = inactiveColor;

    if (approximateTotalTime) {
      store.approximateTotalTimeAtom.set(approximateTotalTime);
    }

    onBufferEndCallback = onBufferEnd || null;
    const initialWidth = containerEl.clientWidth;
    const initialHeight = containerEl.clientHeight;
    const playerFrameHeight = initialHeight - CONTROLLER_HEIGHT;

    store.playerDimensionsAtom.set({
      width: initialWidth,
      height: playerFrameHeight,
    });
    store.originalDimensionsAtom.set({
      width: initialWidth,
      height: playerFrameHeight,
    });
    store.maxScaleAtom.set(maxScale);
    store.skipInactiveAtom.set(skipInactive);
    store.speedAtom.set(speed);

    replayer = new Replayer(events, {
      root: frameEl,
      speed,
      skipInactive: false,
      unpackFn: unpack,
      UNSAFE_replayCanvas: true,

      ...replayerProps,
    });

    (window as any).replayer = replayer;

    recalculateDerivedData(tags, inactiveColor);

    replayer.on("resize", (dimension) =>
      updateScale(
        replayer!.wrapper,
        dimension as { width: number; height: number },
      ),
    );

    if (autoPlay) {
      this.play();
    }

    mainLoop();
  },

  updateDimensions(width: number, height: number) {
    store.playerDimensionsAtom.set({
      width,
      height: height - CONTROLLER_HEIGHT,
    });
    this.triggerResize();
  },

  destroy() {
    stopMainLoop();
    if (replayer) replayer.destroy();
    replayer = null;
    isFetchingNextChunk = false;

    store.playerStatusAtom.set("paused");
    store.bufferingAtom.set(false);
    store.speedStateAtom.set("normal");
    store.currentTimeAtom.set(0);
    store.metaDataAtom.set(null);
    store.skipInactiveAtom.set(true);
    store.speedAtom.set(1);
    store.maxScaleAtom.set(1);
    store.playerDimensionsAtom.set({ width: 1024, height: 576 });
    store.originalDimensionsAtom.set({ width: 1024, height: 576 });
    store.loopAtom.set(null);
    store.pauseAtAtom.set(false);
    store.onPauseHookAtom.set(null);
    store.customEventsAtom.set([]);
    store.inactivePeriodsAtom.set([]);
  },

  getReplayer() {
    return replayer;
  },

  play(time?: number) {
    if (!replayer) return;
    const timeToPlay = time ?? replayer.getCurrentTime();
    replayer.play(timeToPlay < 0 ? undefined : timeToPlay);
    store.playerStatusAtom.set("playing");
  },

  pause(time?: number) {
    if (!replayer) return;
    replayer.pause(time);
    store.playerStatusAtom.set("paused");
  },

  toggle() {
    const currentStatus = store.playerStatusAtom.get();
    if (currentStatus === "playing") {
      playerService.pause();
    } else {
      const isEnded = currentStatus === "ended";
      playerService.play(isEnded ? 0 : undefined);
    }
  },

  async goto(timeOffset: number, shouldPlay?: boolean) {
    if (!replayer || isFetchingNextChunk) return;

    const currentTotalTime = replayer.getMetaData().totalTime;

    if (timeOffset > currentTotalTime && !hasMoreChunks) {
      this.pause(currentTotalTime);
      store.playerStatusAtom.set("ended");
      return;
    }

    const isSeekingAhead = timeOffset > currentTotalTime;

    if (!isSeekingAhead) {
      const resumePlaying =
        shouldPlay ?? store.playerStatusAtom.get() === "playing";
      if (resumePlaying) {
        this.play(timeOffset);
      } else {
        this.pause(timeOffset);
      }
      return;
    }

    if (!onBufferEndCallback || !hasMoreChunks) {
      this.play(currentTotalTime);
      return;
    }

    isFetchingNextChunk = true;
    store.bufferingAtom.set(true);
    replayer.pause();
    store.currentTimeAtom.set(timeOffset);

    while (replayer.getMetaData().totalTime < timeOffset && hasMoreChunks) {
      await fetchNextChunk();
    }

    isFetchingNextChunk = false;
    store.bufferingAtom.set(false);

    const finalTotalTime = replayer.getMetaData().totalTime;
    if (timeOffset > finalTotalTime) {
      this.pause(finalTotalTime);
      store.playerStatusAtom.set("ended");
    } else {
      const resumePlaying =
        shouldPlay ?? store.playerStatusAtom.get() === "playing";
      if (resumePlaying) {
        this.play(timeOffset);
      } else {
        this.pause(timeOffset);
      }
    }
  },

  setSpeed(speed: number) {
    store.speedAtom.set(speed);
  },

  toggleSkipInactive() {
    store.skipInactiveAtom.set(!store.skipInactiveAtom.get());
  },

  triggerResize() {
    if (replayer) {
      updateScale(replayer.wrapper, {
        width: replayer.iframe.offsetWidth,
        height: replayer.iframe.offsetHeight,
      });
    }
  },
};