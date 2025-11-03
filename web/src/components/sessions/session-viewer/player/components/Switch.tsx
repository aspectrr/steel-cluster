import React from "react";
import "./Switch.css";

interface SwitchProps {
  disabled: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  label: string;
}

export const Switch: React.FC<SwitchProps> = ({
  disabled,
  checked,
  onChange,
  id,
  label,
}) => {
  return (
    <div className={`rr-switch ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} />
      <span className="label">{label}</span>
    </div>
  );
};