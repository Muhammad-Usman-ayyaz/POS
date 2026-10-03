// The UI package. The desktop renderer imports the stylesheet (`@pos/ui/styles.css`) and mounts <App />.
export { App } from './app/app.js';
export { AppShell } from './components/app-shell.js';
export { ErrorNotice, Notice, ToastProvider, useToast } from './components/feedback.js';
export { LanguageSwitch, NAV_ITEMS, Sidebar, type PageKey } from './components/sidebar.js';
export { Button, buttonVariants } from './components/ui/button.js';
export { Input } from './components/ui/input.js';
export { Badge, Card, Field, Label, Num } from './components/ui/primitives.js';
export { SegmentedToggle } from './components/ui/segmented.js';
export * from './i18n/index.js';
export { cn } from './lib/cn.js';
