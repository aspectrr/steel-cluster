import { unpack } from "@rrweb/packer";
import { PlayerMachineState, SpeedMachineState } from "@rrweb/replay";

export type EventWithTime = ReturnType<typeof unpack>;

export type StateChangeEvent = { 
  player?: PlayerMachineState;
  speed?: SpeedMachineState;
};

export type PlayerState =
  | {
      value: 'playing';
      context: PlayerContext;
    }
  | {
      value: 'paused';
      context: PlayerContext;
    }
  | {
      value: 'live';
      context: PlayerContext;
    };

export type PlayerContext = {
  events: EventWithTime[];
  timer: unknown;
  timeOffset: number;
  baselineTime: number;
  lastPlayedEvent: EventWithTime | null;
};