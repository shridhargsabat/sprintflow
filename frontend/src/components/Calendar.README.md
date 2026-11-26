# Calendar

Reusable custom date picker (button trigger + portal popover). No native input.

## Props

| Prop | Type | Description |
|---|---|---|
| `value` | `string` | Selected date `YYYY-MM-DD`; `''` = unset |
| `onChange` | `(isoDate: string) => void` | Called with `YYYY-MM-DD` on day click |
| `id?` | `string` | Trigger button id |
| `placeholder?` | `string` | Shown when unset (default `'Select date'`) |
| `min?` / `max?` | `string` | `YYYY-MM-DD` range; outside days disabled |
| `className?` | `string` | Trigger button override |
| `menuClassName?` | `string` | Extra classes for the popover |

## Usage

```tsx
import Calendar from './Calendar';

const [due, setDue] = useState('');
<Calendar value={due} onChange={setDue} placeholder="Due date" min="2026-01-01" />;
```

Trigger shows e.g. `Dec 7, 2026`. Grid weeks start Monday.
Selected day highlighted, today ringed. Arrows move, Enter selects, Escape closes.
