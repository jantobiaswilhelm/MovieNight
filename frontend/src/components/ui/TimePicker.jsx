import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import './ui.css';

const pad = (n) => String(n).padStart(2, '0');

function parse(value) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec((value || '').trim());
  let h = match ? parseInt(match[1], 10) : 0;
  let m = match ? parseInt(match[2], 10) : 0;
  if (Number.isNaN(h)) h = 0;
  if (Number.isNaN(m)) m = 0;
  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

/**
 * Themed 24-hour time stepper — a drop-in replacement for <input type="time">.
 * Both `value` and `onChange` speak the native "HH:MM" string format, so it can
 * be swapped in anywhere the native control was used with no other changes.
 *
 * Type digits, use ▲/▼ buttons, or the Up/Down arrow keys. Minutes step by
 * `minuteStep` (default 15) and carry into the hour; both fields wrap.
 */
export default function TimePicker({
  value,
  onChange,
  minuteStep = 15,
  disabled = false,
  className = '',
  id,
  'aria-label': ariaLabel,
}) {
  const { h, m } = parse(value);
  const [hStr, setHStr] = useState(pad(h));
  const [mStr, setMStr] = useState(pad(m));
  const focusRef = useRef(false);

  // Re-sync the displayed digits when the external value changes, but never
  // while the user is mid-edit (that would clobber their typing).
  useEffect(() => {
    if (!focusRef.current) {
      setHStr(pad(h));
      setMStr(pad(m));
    }
  }, [h, m]);

  const emit = (nh, nm) => onChange?.(`${pad((nh + 24) % 24)}:${pad((nm + 60) % 60)}`);

  const stepH = (dir) => emit((h + dir + 24) % 24, m);
  const stepM = (dir) => {
    let total = h * 60 + m + dir * minuteStep;
    total = (total + 1440) % 1440;
    emit(Math.floor(total / 60), total % 60);
  };

  const onHChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setHStr(raw);
    if (raw !== '') emit(Math.min(23, parseInt(raw, 10)), m);
  };
  const onMChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMStr(raw);
    if (raw !== '') emit(h, Math.min(59, parseInt(raw, 10)));
  };

  const onFocus = (e) => { focusRef.current = true; e.target.select(); };
  const onHBlur = () => { focusRef.current = false; if (hStr === '') emit(0, m); setHStr(pad(h)); };
  const onMBlur = () => { focusRef.current = false; if (mStr === '') emit(h, 0); setMStr(pad(m)); };

  const keyStep = (fn) => (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); fn(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); fn(-1); }
  };

  const field = (label, str, changeFn, blurFn, stepFn, inputId) => (
    <div className="tp-field">
      <button
        type="button" className="tp-step" tabIndex={-1} disabled={disabled}
        aria-label={`Increase ${label}`} onClick={() => stepFn(1)}
      >
        <Icon name="chevron-up" size={12} stroke={2} />
      </button>
      <input
        id={inputId}
        className="tp-input"
        inputMode="numeric"
        value={str}
        disabled={disabled}
        aria-label={label}
        onChange={changeFn}
        onFocus={onFocus}
        onBlur={blurFn}
        onKeyDown={keyStep(stepFn)}
      />
      <button
        type="button" className="tp-step" tabIndex={-1} disabled={disabled}
        aria-label={`Decrease ${label}`} onClick={() => stepFn(-1)}
      >
        <Icon name="chevron" size={12} stroke={2} />
      </button>
    </div>
  );

  return (
    <div
      className={`timepicker ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel || 'Time'}
    >
      {field('Hours', hStr, onHChange, onHBlur, stepH, id)}
      <span className="tp-colon" aria-hidden="true">:</span>
      {field('Minutes', mStr, onMChange, onMBlur, stepM)}
    </div>
  );
}
