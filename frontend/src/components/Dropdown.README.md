# Dropdown

Custom button + popover menu. Replaces native `<select>` app-wide.

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | — | Selected option value |
| `options` | `{value; label}[]` | — | Menu options |
| `onChange` | `(value) => void` | — | Fires on select |
| `id` | `string` | auto | Trigger id / a11y prefix |
| `label` | `string` | — | Visible label above trigger |
| `placeholder` | `string` | `Select…` | Shown when nothing selected |
| `className` | `string` | glass pill | Full trigger override |
| `menuClassName` | `string` | — | Extra menu classes |
| `align` | `left \| right` | `left` | Menu alignment |

Keyboard: `↑` `↓` move, `Home`/`End` jump, `Enter` selects, `Esc` closes.

```tsx
import Dropdown from './components/Dropdown';

<Dropdown
  label="Status"
  value={status}
  options={[{ value: 'todo', label: 'To Do' }, { value: 'done', label: 'Done' }]}
  onChange={setStatus}
  placeholder="Pick status"
/>
```
