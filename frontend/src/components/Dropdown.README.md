# Dropdown

Custom button + popover menu. Replaces native `<select>` app-wide.

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` (single) / `string[]` (`multi`) | — | Selected option value(s) |
| `options` | `{value; label; group?}[]` | — | Menu options; `group` renders sticky section headers |
| `onChange` | `(value) => void` | — | Fires on select (single) or toggle (multi, same shape as `value`) |
| `multi` | `boolean` | `false` | Multi-select with checkbox state; trigger stays compact (`N selected`) |
| `searchable` | `boolean` | `false` | Filter input on top of the menu (matches `label`, case-insensitive) |
| `searchPlaceholder` | `string` | `Search…` | Search input placeholder |
| `id` | `string` | auto | Trigger id / a11y prefix |
| `label` | `string` | — | Visible label above trigger |
| `placeholder` | `string` | `Select…` | Shown when nothing selected |
| `className` | `string` | glass pill | Full trigger override |
| `menuClassName` | `string` | — | Extra menu classes |
| `align` | `left \| right` | `left` | Menu alignment |

Single-select with flags off behaves exactly as before. In `multi` mode the menu
stays open on toggle; keyboard (`↑` `↓` move, `Home`/`End` jump, `Enter` selects,
`Esc` closes) operates on the visible (filtered) options.

```tsx
import Dropdown from './components/Dropdown';

<Dropdown
  label="Status"
  value={status}
  options={[{ value: 'todo', label: 'To Do' }, { value: 'done', label: 'Done' }]}
  onChange={setStatus}
  placeholder="Pick status"
/>

// Multi + searchable + grouped (assignee picker)
<Dropdown
  multi
  searchable
  value={assigneeKeys}
  onChange={setAssigneeKeys}
  options={[
    { value: 'member:m1', label: 'Ada (Engineer)', group: 'Team members' },
    { value: 'user:7', label: 'grace@x.dev', group: 'Login users' },
  ]}
  placeholder="Select assignees…"
/>
```
