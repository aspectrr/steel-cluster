import React, { useMemo, useRef } from "react";
import { useStore } from "@nanostores/react";
import {
  currentTimeAtom,
  metaDataAtom,
  playerStatusAtom,
  speedAtom,
  speedStateAtom,
  customEventsAtom,
  inactivePeriodsAtom,
  approximateTotalTimeAtom,
  skipInactiveAtom,
} from "../player-stores";
import { formatTime } from "../player-utils";
import * as actions from "../player-actions";
import "./Controller.css";
import { Switch } from "./Switch";

interface ControllerProps {
  speedOption: number[];
}

export function Controller({ speedOption }: ControllerProps) {
  const currentTime = useStore(currentTimeAtom);
  const meta = useStore(metaDataAtom);
  const playerStatus = useStore(playerStatusAtom);
  const speedState = useStore(speedStateAtom);
  const speed = useStore(speedAtom);
  const skipInactive = useStore(skipInactiveAtom);
  const customEvents = useStore(customEventsAtom);
  const inactivePeriods = useStore(inactivePeriodsAtom);
  const approximateTotalTime = useStore(approximateTotalTimeAtom);
  const displayTotalTime = Math.max(
    approximateTotalTime ?? 0,
    meta?.totalTime ?? 0,
  );

  const progressRef = useRef<HTMLDivElement>(null);

  const percentage = useMemo(() => {
    if (!displayTotalTime) return "0%";
    const percent = Math.min(1, currentTime / displayTotalTime);
    return `${100 * percent}%`;
  }, [currentTime, displayTotalTime]);

  const handleProgressClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (speedState === "skipping" || !progressRef.current) return;
    const progressRect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (event.clientX - progressRect.left) / progressRect.width),
    );
    actions.goto(displayTotalTime * percent);
  };

  return (
    <div className="rr-controller">
      <div className="rr-timeline">
        <span className="rr-timeline__time">{formatTime(currentTime)}</span>
        <div
          className={`rr-progress ${speedState === "skipping" ? "disabled" : ""}`}
          ref={progressRef}
          onClick={handleProgressClick}
        >
          <div className="rr-progress__step" style={{ width: percentage }} />
          {inactivePeriods.map((period, i) => (
            <div
              key={i}
              title={period.name}
              style={{
                width: period.width,
                height: "100%",
                position: "absolute",
                background: period.background,
                left: period.position,
              }}
            />
          ))}
          {customEvents.map((event, i) => (
            <div
              key={i}
              title={event.name}
              style={{
                width: "10px",
                height: "5px",
                position: "absolute",
                top: "2px",
                transform: "translate(-50%, -50%)",
                background: event.background,
                left: event.position,
              }}
            />
          ))}
        </div>
        <span className="rr-timeline__time">
          {formatTime(displayTotalTime || 0)}
        </span>
      </div>
      <div className="rr-controller__btns">
        <button onClick={actions.toggle}>
          {playerStatus === "playing" ? (
            <svg viewBox="0 0 1024 1024" width="16" height="16">
              <path d="M682.7 128q53 0 90.5 37.5T810.7 256v512q0 53-37.5 90.5T682.7 896q-53 0-90.5-37.5T554.7 768V256q0-53 37.5-90.5T682.7 128zM341.3 128q53 0 90.5 37.5T469.3 256v512q0 53-37.5 90.5T341.3 896q-53 0-90.5-37.5T213.3 768V256q0-53 37.5-90.5T341.3 128z" />
            </svg>
          ) : (
            <svg viewBox="0 0 1024 1024" width="16" height="16">
              <path d="M170.7 896V128l640 384zM644.7 512L256 278.6v466.7z" />
            </svg>
          )}
        </button>
        {speedOption.map((s) => (
          <button
            key={s}
            className={s === speed && speedState !== "skipping" ? "active" : ""}
            onClick={() => actions.setSpeed(s)}
            disabled={speedState === "skipping"}
          >
            {s}x
          </button>
        ))}
        <Switch
          id="skip"
          checked={skipInactive}
          onChange={actions.toggleSkipInactive}
          disabled={speedState === "skipping"}
          label="skip inactive"
        />
      </div>
    </div>
  );
};