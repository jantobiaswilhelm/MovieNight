import './SegmentedControl.css';

export default function SegmentedControl({ options, value, onChange, variant }) {
  return (
    <div className={`seg${variant === 'gold' ? ' seg-gold' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
