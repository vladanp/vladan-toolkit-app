import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { HomePage } from './routes/HomePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { SettingsPage } from './routes/SettingsPage';
import { ToolPage } from './routes/ToolPage';
import { AppShell } from './shell/AppShell';

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFoundPage });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const toolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools/$toolId',
  component: ToolPage,
});

export const routeTree = rootRoute.addChildren([homeRoute, settingsRoute, toolRoute]);

/**
 * Hash history: the app is served from a custom protocol (tauri://) with no server-side
 * routing, and it keeps deep links working in the browser preview too.
 */
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
