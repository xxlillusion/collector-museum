import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import App from './App';

// Route table — FROZEN after Phase 0. Every later workstream's entry point is
// pre-stubbed here so no stream ever edits this file; streams replace the
// bodies of the screen files they own. All platform pages are lazy so the
// landing/app chunk never grows with them.
const LoginScreen = lazy(() => import('./screens/auth/LoginScreen'));
const SignupScreen = lazy(() => import('./screens/auth/SignupScreen'));
const AccountScreen = lazy(() => import('./screens/auth/AccountScreen'));
const VendorPage = lazy(() => import('./screens/vendor/VendorPage'));
const ShowDirectory = lazy(() => import('./screens/shows/ShowDirectory'));
const ShowDetail = lazy(() => import('./screens/shows/ShowDetail'));
const OrganizerHome = lazy(() => import('./screens/organizer/OrganizerHome'));

function PageFallback() {
  return <div style={{ height: '100vh', background: '#0b0a08' }} />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/login" component={LoginScreen} />
        <Route path="/signup" component={SignupScreen} />
        <Route path="/account" component={AccountScreen} />
        <Route path="/vendor/:id">{(params) => <VendorPage vendorId={params.id} />}</Route>
        <Route path="/shows" component={ShowDirectory} />
        <Route path="/show/:id">{(params) => <ShowDetail showId={params.id} />}</Route>
        <Route path="/organizer" component={OrganizerHome} />
        {/* Default: the original app — museum / registry / convention view,
            still driven by App's internal view union (the fullscreen R3F
            canvases must stay outside any route transition). */}
        <Route>
          <App />
        </Route>
      </Switch>
    </Suspense>
  );
}
