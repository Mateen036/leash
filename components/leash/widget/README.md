# Leash widget primitives

Import from `@/components/leash/widget`. Styles are loaded globally via `app/widget.css`. All motion respects reduced motion. No network calls, execution, or fake state inside these primitives.

- `WidgetShell`: `title?`, `children`, `tabs?: {value,label}[]`, `value?`, `onTabChange?`, `actions?` (icons), `picker?` (replaces card contents), `sidePanel?` (right desktop, below mobile), `className?`.
- `Tabs`: `tabs`, `value`, `onChange`, `label?`. Animated pill scoped with useId.
- `WidgetToken`: `{id, symbol, name?, chain?, balance?, color?}`. Generated letter glyphs only.
- `AmountPanel`: `label`, `amount` (string), `token`, `onChange?`, `onTokenClick?`, `balance?`, `onMax?`, `subValue?`, `readOnly?`, `loading?`, `disabled?`.
- `TokenPill`: `token`, `onClick?`, `disabled?`. `TokenGlyph`: `token`, `size?`.
- `FlipButton`: `onClick?`, `label?`, `disabled?`. Overlaps seam; click rotates. Put between AmountPanels.
- `TokenPicker`: `tokens`, `onSelect(token)`, `onClose`, `selected?`, `title?`, `chains?: string[]`, `chain?`, `onChainChange?`, `loading?`. Search + Esc + autofocus. Feed via WidgetShell.picker; restore trigger focus in caller if needed.
- `QuoteCard`: `title`, `ariaLabel?`, `output?`, `subtitle?`, `tag?` (`Only route`, `Best rate`, `Fastest`: caller must justify), `badges?`, `metrics?: {label,value,warning?,icon?}[]`, `steps?`, `children?`, `selected?`, `onSelect?`, `remaining?` (seconds), `quoteDuration?` (60 seconds default), `className?`.
- `RouteList`: `title?`, `children`. `RefreshRing`: `remaining`, `total?` (60 default); shows expiry, does not refresh data.
- `ExecutionTimeline`: `steps: {label, detail?, status: idle|pending|success|error, href?}[]`, `success?`. Reflect actual progress only. Never mark guard checks complete before receipts.
- `Skeleton`: `width?`, `height?`, `className?`. `QuoteSkeleton`: accessible live-data placeholder. `EmptyState`: `title`, `description?`, `icon?`, `children?`.
- `PressableButton`: motion button props + `variant?: primary|secondary|danger`. Defaults type=button; use type=submit for forms.
- `PageHeader`: `eyebrow`, `title`, `description`, `badges?`.
- `NumberTicker`: existing shared ticker, now reduced-motion safe; `value`, `decimalPlaces?`, standard span props.
- `useToast()`: returns `toast({title, description?, variant?: success|error, href?})`. Provider is already in root layout; no extra provider needed.

Preview and execution logic stays in ActionPreview and existing lib/defi/execution. Standard account controls / guard controls remain required. CSS utility names: `widget-footnote`, `widget-inline-note`, `widget-info`, `widget-icon-button`.
