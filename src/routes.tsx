import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import App, { SandboxApp } from './App';

// Route table — FROZEN (extended once for Wave 2). Every workstream's entry
// point is pre-stubbed here so no stream ever edits this file; streams
// replace the bodies of the screen files they own. All platform pages are
// lazy so the landing/app chunk never grows with them.
const LoginScreen = lazy(() => import('./screens/auth/LoginScreen'));
const SignupScreen = lazy(() => import('./screens/auth/SignupScreen'));
const AccountScreen = lazy(() => import('./screens/auth/AccountScreen'));
const ResetPasswordScreen = lazy(() => import('./screens/auth/ResetPasswordScreen'));
const VendorPage = lazy(() => import('./screens/vendor/VendorPage'));
const VendorDirectory = lazy(() => import('./screens/vendor/VendorDirectory'));
const CollectorPage = lazy(() => import('./screens/collector/CollectorPage'));
const VendorMuseum = lazy(() => import('./screens/museum/VendorMuseum'));
const CollectorMuseum = lazy(() => import('./screens/museum/CollectorMuseum'));
const ShowDirectory = lazy(() => import('./screens/shows/ShowDirectory'));
const ShowDetail = lazy(() => import('./screens/shows/ShowDetail'));
const OrganizerHome = lazy(() => import('./screens/organizer/OrganizerHome'));
const ShowEditorScreen = lazy(() => import('./screens/organizer/ShowEditorScreen'));
const NotFoundScreen = lazy(() => import('./screens/NotFoundScreen'));

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
        <Route path="/reset-password" component={ResetPasswordScreen} />
        <Route path="/vendor/:id">{(params) => <VendorPage vendorId={params.id} />}</Route>
        <Route path="/vendors" component={VendorDirectory} />
        <Route path="/collector/:id">{(params) => <CollectorPage profileId={params.id} />}</Route>
        <Route path="/museum/vendor/:id">{(params) => <VendorMuseum vendorId={params.id} />}</Route>
        <Route path="/museum/collector/:id">
          {(params) => <CollectorMuseum profileId={params.id} />}
        </Route>
        <Route path="/shows" component={ShowDirectory} />
        <Route path="/show/:id">{(params) => <ShowDetail showId={params.id} />}</Route>
        <Route path="/organizer" component={OrganizerHome} />
        {/* The local, no-account experience — forced local provider; shares
            App's chunk (and its lazily loaded canvases) on purpose. */}
        <Route path="/sandbox" component={SandboxApp} />
        <Route path="/organizer/show/new">
          <ShowEditorScreen />
        </Route>
        <Route path="/organizer/show/:id/edit">
          {(params) => <ShowEditorScreen showId={params.id} />}
        </Route>
        {/* The root: the original app — museum / registry / convention view,
            still driven by App's internal view union (the fullscreen R3F
            canvases must stay outside any route transition). */}
        <Route path="/">
          <App />
        </Route>
        {/* Anything else is a genuine unknown URL. */}
        <Route component={NotFoundScreen} />
      </Switch>
    </Suspense>
  );
}
