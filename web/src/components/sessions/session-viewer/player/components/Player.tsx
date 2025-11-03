import { useStore } from "@nanostores/react";
import type { eventWithTime } from "@rrweb/types";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Controller } from "./Controller";
import * as actions from "../player-actions";
import { playerService } from "../player-service";
import * as store from "../player-stores";
import type { RRwebPlayerExpose, RRwebPlayerOptions } from "../player-types";
import type { Mirror } from "rrweb-snapshot";
import "./Player.css";

type PlayerProps = RRwebPlayerOptions["props"];

export type PlayerHandle = RRwebPlayerExpose & {
  init: (containerEl: HTMLDivElement) => void;
  destroy: () => void;
};

export const Player = forwardRef<PlayerHandle, PlayerProps>((props, ref) => {
  const { showController = true, speedOption = [1, 2, 4, 8] } = props;
  const playerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const playerDimensions = useStore(store.playerDimensionsAtom);
  const meta = useStore(store.metaDataAtom);
  const isBuffering = useStore(store.bufferingAtom);
  const isSeeking = useStore(store.seekingAtom);

  const controllerHeight = 80;
  const playerStyle = {
    width: `${playerDimensions.width}px`,
    height: `${playerDimensions.height + (showController ? controllerHeight : 0)}px`,
  };
  const frameStyle = {
    width: `${playerDimensions.width}px`,
    height: `${playerDimensions.height}px`,
  };

  useImperativeHandle(ref, () => {
    const _getReplayerOrThrow = () => {
      const replayer = playerService.getReplayer();
      if (!replayer) {
        throw new Error(
          "Player is not initialized. Cannot access replayer instance.",
        );
      }
      return replayer;
    };

    return {
      init: (containerEl: HTMLDivElement) => {
        if (frameRef.current && playerRef.current) {
          playerService.init({
            ...props,
            containerEl,
            frameEl: frameRef.current,
            playerEl: playerRef.current,
            mouseTail: false,
            skipInactive: true,
          });
        }
      },
      destroy: () => {
        playerService.destroy();
      },
      addEventListener: (event, handler) => {
        playerService.getReplayer()?.on(event, handler);
      },
      addEvent: (event: eventWithTime) => {
        _getReplayerOrThrow().addEvent(event);
      },
      getMetaData: () => {
        return _getReplayerOrThrow().getMetaData();
      },
      getReplayer: () => {
        return _getReplayerOrThrow();
      },
      getMirror: () => {
        return _getReplayerOrThrow().getMirror() as unknown as Mirror;
      },
      toggle: actions.toggle,
      setSpeed: actions.setSpeed,
      toggleSkipInactive: actions.toggleSkipInactive,
      play: actions.play,
      pause: actions.pause,
      goto: actions.goto,
      playRange: actions.playRange,
      triggerResize: () => playerService.triggerResize(),
      $set: (options) => store.playerDimensionsAtom.set(options),
    };
  });

  return (
    <div className="rr-player" ref={playerRef} style={playerStyle}>
      <div>
        <div className="rr-player__frame" ref={frameRef} style={frameStyle} />
        {(isBuffering || isSeeking) && (
          <div className="absolute inset-0 z-1 flex items-center justify-center bg-black/15 z-50">
            <div className="rr-overlay-spinner text-slate-50" />
          </div>
        )}
      </div>
      {meta && showController && (
        <Controller
          speedOption={speedOption}
        />
      )}
    </div>
  );
});

Player.displayName = "Player";