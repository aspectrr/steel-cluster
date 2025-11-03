import type { eventWithTime, playerMetaData } from "@rrweb/types";
import type { Replayer, playerConfig } from "@rrweb/replay";
import type { Mirror } from "rrweb-snapshot";

export type RRwebPlayerOptions = {
  target: HTMLElement;
  props: {
    /**
     * The events to replay.
     * @default `[]`
     */
    events: eventWithTime[];
    approximateTotalTime?: number;
    /**
     * The maximum scale of the replayer (1 = 100%). Set to 0 for unlimited
     * @defaultValue `1`
     */
    maxScale?: number;
    /**
     * Whether to autoplay
     * @defaultValue `true`
     */
    autoPlay?: boolean;
    /**
     * The default speed to play at
     * @defaultValue `1`
     */
    speed?: number;
    /**
     * Speed options in UI
     * @defaultValue `[1, 2, 4, 8]`
     */
    speedOption?: number[];
    /**
     * Whether to show the controller UI
     * @defaultValue `true`
     */
    showController?: boolean;
    /**
     * Customize the custom events style with a key-value map
     * @defaultValue `{}`
     */
    tags?: Record<string, string>;
    /**
     * Customize the color of inactive periods indicator in the progress bar with a valid CSS color string.
     * @defaultValue `#D4D4D4`
     */
    inactiveColor?: string;
    /**
     * A callback that fires when playback nears the end of the buffered events.
     * It should fetch and return the next chunk of events.
     */
    onBufferEnd?: () => Promise<eventWithTime[] | undefined>;
  } & Partial<playerConfig>;
};

export type RRwebPlayerExpose = {
  addEventListener: (event: string, handler: (params: unknown) => unknown) => void;
  addEvent: (event: eventWithTime) => void;
  getMetaData: () => playerMetaData;
  getReplayer: () => Replayer;
  getMirror: () => Mirror;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  toggleSkipInactive: () => void;
  triggerResize: () => void;
  $set: (options: { width: number; height: number }) => void;
  play: () => void;
  pause: () => void;
  goto: (timeOffset: number, play?: boolean) => void;
  playRange: (timeOffset: number, endTimeOffset: number, startLooping?: boolean, afterHook?: undefined | (() => void)) => void;
};