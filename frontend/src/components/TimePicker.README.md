# TimePicker

Reusable custom time picker (button + portal popover, no native input).

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string?` | — | Trigger/menu id base |
| `value` | `string` | — | `HH:MM` 24h; `''` = unset |
| `onChange` | `(hhmm: string) => void` | — | Fires on hour+minute commit |
| `placeholder` | `string?` | `'Select time'` | Shown when unset |
| `stepMinutes` | `number?` | `15` | Minute column steps |
| `className` | `string?` | glass pill | Trigger override |
| `menuClassName` | `string?` | — | Extra popover classes |

## Usage

```tsx
import TimePicker from './TimePicker';

const [time, setTime] = useState('');
<TimePicker value={time} onChange={setTime} placeholder="Start time" stepMinutes={15} />
```

Keys: ←/→ switch column, ↑/↓ move, Enter/Space select, Esc closes.
