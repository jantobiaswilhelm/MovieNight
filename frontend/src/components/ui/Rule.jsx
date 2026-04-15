import './ui.css';

export default function Rule({ strong = false, className = '' }) {
  return <hr className={`rule ${strong ? 'strong' : ''} ${className}`.trim()} />;
}
