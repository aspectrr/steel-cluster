import { atom } from "nanostores";

import type { SpeedMachineState } from "@rrweb/replay";
import type { playerMetaData } from '@rrweb/types';

type Marker = { name: string; background: string; position: string };
type PeriodMarker = Marker & { 
  width: string;
  start: number;
  end: number;
};

export const playerStatusAtom = atom<"playing" | "paused" | "ended">("paused");
export const speedStateAtom = atom<SpeedMachineState["value"]>("normal");
export const currentTimeAtom = atom<number>(0);
export const metaDataAtom = atom<playerMetaData | null>(null);
export const bufferingAtom = atom<boolean>(false);
export const approximateTotalTimeAtom = atom<number | null>(null);
export const seekingAtom = atom<boolean>(false);

export const skipInactiveAtom = atom<boolean>(true);
export const speedAtom = atom<number>(1);
export const maxScaleAtom = atom<number>(1);

export const playerDimensionsAtom = atom({ width: 1024, height: 576 });
export const originalDimensionsAtom = atom({ width: 1024, height: 576 });

export const loopAtom = atom<{ start: number; end: number } | null>(null);
export const pauseAtAtom = atom<number | false>(false);
export const onPauseHookAtom = atom<(() => unknown) | null>(null);

export const customEventsAtom = atom<Marker[]>([]);
export const inactivePeriodsAtom = atom<PeriodMarker[]>([]);
