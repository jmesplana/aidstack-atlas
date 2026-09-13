import { deltaPresentation } from '../../../lib/outbreak/response';
import { formatValue } from '../../../lib/outbreak/data';
import styles from './outbreak.module.css';

// Directional change indicator. `rising` sets which direction is styled as concerning:
// for case counts an increase is adverse (rising=true); for response coverage a decrease is (rising=false).
// A fall in a cumulative series is a revision, never improvement: it is shown neutrally
// regardless of `rising`. `neutral` suppresses any judgement where none can be supported.
export default function Delta({ delta, rising = true, suffix = '', kind, neutral = false }) {
  const presentation = deltaPresentation(delta, { rising, kind, neutral });
  const tone = presentation.tone === 'adverse' ? styles.deltaAdverse : presentation.tone === 'good' ? styles.deltaGood : styles.deltaFlat;
  const text = presentation.trend === 'none' ? 'no comparable value' : `${delta > 0 ? '+' : ''}${formatValue(delta)}${suffix}${presentation.revision ? ' (revision)' : ''}`;
  return <span className={`${styles.delta} ${tone}`}><span aria-hidden="true">{presentation.glyph}</span> {text}</span>;
}
