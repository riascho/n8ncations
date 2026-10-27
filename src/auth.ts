/* Sign-in against Google, with an n8n workflow acting as the confidential client. The browser never sees a Google token: the callback webhook exchanges the authorization code, checks the Workspace domain, and hands back an n8n-signed session JWT in the URL fragment. We decode that JWT here only to show a name and avatar. Nothing in this file is a security check — every write is re-verified by n8n, which holds the signing key. */

const SESSION_KEY = "n8ncation.session.v1";
const STATE_KEY = "n8ncation.oauth-state";
const RETURN_PATH_KEY = "n8ncation.return-path";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = "openid email profile";
const HOSTED_DOMAIN = "n8n.io";
/* Treat a token as spent slightly early, so a vote cannot leave in the gap between our check and n8n's. */
const EXPIRY_SKEW_SECONDS = 30;

const OAUTH_WINDOW_NAME = "n8ncation-oauth";
const AUTH_MESSAGE = "n8ncation-auth-result";

/* How the returning document works out whether it is the popup or the page itself. The marker is prefixed onto `state`, so it travels through Google and n8n and comes back untouched. window.name would be the obvious carrier, but Chrome clears it whenever a top-level context navigates cross-origin — which this flow does, twice. */
const POPUP_STATE_PREFIX = "p.";
const REDIRECT_STATE_PREFIX = "r.";

interface AuthMessage {
  type: typeof AUTH_MESSAGE;
  session: string | null;
  state: string | null;
  error: string | null;
}

export interface SessionUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

interface SessionClaims extends SessionUser {
  exp?: number;
}

export type RedirectOutcome =
  | { kind: "none" }
  | { kind: "signed-in"; user: SessionUser }
  | { kind: "error"; message: string };

function base64UrlDecode(segment: string): string {
  const padded = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");
  /* decodeURIComponent/escape round-trip so non-ASCII names survive. */
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeClaims(token: string): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1])) as unknown;
    if (!claims || typeof claims !== "object") {
      return null;
    }
    const record = claims as Record<string, unknown>;
    if (typeof record["sub"] !== "string") {
      return null;
    }
    return {
      sub: record["sub"],
      name: typeof record["name"] === "string" ? record["name"] : "",
      email: typeof record["email"] === "string" ? record["email"] : "",
      picture: typeof record["picture"] === "string" ? record["picture"] : "",
      ...(typeof record["exp"] === "number" ? { exp: record["exp"] } : {}),
    };
  } catch {
    return null;
  }
}

function isExpired(claims: SessionClaims): boolean {
  /* Fail closed. `exp` is a required NumericDate (RFC 7519 §2) — seconds since
     the epoch, as a JSON number. decodeClaims drops it if it arrives as a
     string, so treating "absent" as "never expires" would turn a quoted value
     or a milliseconds timestamp in the signing workflow into a session that
     looks permanent here while n8n rejects every write. */
  if (typeof claims.exp !== "number") {
    return true;
  }
  return claims.exp - EXPIRY_SKEW_SECONDS <= Date.now() / 1000;
}

function readStoredToken(): string | null {
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!token) {
    return null;
  }
  const claims = decodeClaims(token);
  if (!claims || isExpired(claims) || isStrayDemoToken(token)) {
    signOut();
    return null;
  }
  return token;
}

/* A demo token minted in mock mode survives in localStorage after the API
   base is set. n8n would reject it on the first call, but until then the
   page would count as signed in and show private markup, so drop it. */
function isStrayDemoToken(token: string): boolean {
  return (
    token.endsWith(".unsigned-demo") &&
    (import.meta.env.VITE_API_BASE ?? "") !== ""
  );
}

/** The session JWT, or null when nobody is signed in. */
export function getToken(): string | null {
  return readStoredToken();
}

export function getUser(): SessionUser | null {
  const token = readStoredToken();
  if (!token) {
    return null;
  }
  const claims = decodeClaims(token);
  return claims ? { ...claims } : null;
}

export function isSignedIn(): boolean {
  return readStoredToken() !== null;
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Nothing to clear if storage is unavailable. */
  }
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* Development helper. Mints an UNSIGNED session so the in-memory mock API can
   be driven without a Google client or a live n8n instance. Only ever called
   when VITE_API_BASE is unset; n8n would reject this token immediately,
   because it carries no signature to verify. */
export function signInAsDemo(): void {
  const claims = {
    sub: "demo-user",
    name: "Demo Colleague",
    email: "demo@n8n.io",
    picture: "",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = `e30.${base64UrlEncode(JSON.stringify(claims))}.unsigned-demo`;
  try {
    window.localStorage.setItem(SESSION_KEY, token);
  } catch {
    throw new Error("Demo sign-in needs local storage, which is unavailable.");
  }
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/* OIDC Core §3.1.2.1 requires authorisation servers to accept POST at the
   authorisation endpoint, with parameters form-encoded in the body (§13.2).
   Using POST instead of a query-string redirect keeps client_id, redirect_uri
   and state out of the URL bar, browser history and the Referer header.

   This has to be a real form submission: the consent screen needs a top-level
   navigation in whichever window it targets, so fetch() would both be blocked
   cross-origin and fail to navigate. */
function buildAuthForm(state: string, target: string): HTMLFormElement {
  const params: Record<string, string> = {
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_OAUTH_REDIRECT,
    response_type: "code",
    scope: SCOPES,
    state,
    /* A hint that narrows the account picker. The backend still has to check
       the hd claim, because this parameter is client-supplied. */
    hd: HOSTED_DOMAIN,
    /* No refresh token: n8n discards Google's tokens once it has read the
       identity claims, so offline access would be a liability with no use. */
    access_type: "online",
  };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = AUTH_ENDPOINT;
  form.target = target;
  form.hidden = true;
  for (const [name, value] of Object.entries(params)) {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.value = value;
    form.appendChild(field);
  }
  document.body.appendChild(form);
  return form;
}

function popupFeatures(): string {
  const width = 520;
  const height = 660;
  /* Centre on the screen the browser window is actually on. */
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 3);
  return `popup=1,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`;
}

/* Signs in through a popup, so the page keeps its scroll position and any
   in-progress state instead of being navigated away.

   Deliberately not async: window.open has to run in the same synchronous turn
   as the click that triggered it, or popup blockers reject it. */
export function beginLogin(): Promise<SessionUser> {
  const popup = window.open("about:blank", OAUTH_WINDOW_NAME, popupFeatures());
  const state =
    (popup ? POPUP_STATE_PREFIX : REDIRECT_STATE_PREFIX) + randomState();

  try {
    window.sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* Without storage we cannot verify state on return, so do not start a
       flow we are unable to validate. */
    popup?.close();
    return Promise.reject(
      new Error("Sign-in needs session storage, which is unavailable."),
    );
  }

  if (!popup) {
    /* Blocked. Fall back to navigating this window, which consumeRedirect()
       picks up on the way back. The returned promise never settles because the
       document is about to be replaced. */
    try {
      /* The callback always lands on the site root — its return URL is fixed
         by the allowlist in the workflow, never sent from here — so remember
         where this started and go back after sign-in. Losing it just means
         landing on the home page, so a storage failure is not worth
         aborting the sign-in over. */
      window.sessionStorage.setItem(RETURN_PATH_KEY, location.pathname);
    } catch {
      /* Fall through to the home page on return. */
    }
    buildAuthForm(state, "_self").submit();
    return new Promise<SessionUser>(() => {});
  }

  buildAuthForm(state, OAUTH_WINDOW_NAME).submit();
  return waitForPopup(popup);
}

function waitForPopup(popup: Window): Promise<SessionUser> {
  return new Promise<SessionUser>((resolve, reject) => {
    const cleanup = (): void => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closeWatch);
    };

    const onMessage = (event: MessageEvent): void => {
      /* The popup visits Google and n8n before coming home, and both could
         reach us through window.opener — so only trust our own origin. */
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as AuthMessage | null;
      if (!data || data.type !== AUTH_MESSAGE) {
        return;
      }
      cleanup();
      popup.close();
      try {
        resolve(completeSignIn(data.session, data.state, data.error));
      } catch (error) {
        reject(error);
      }
    };

    window.addEventListener("message", onMessage);

    /* Nothing notifies us when somebody just dismisses the window. */
    const closeWatch = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Sign-in was cancelled."));
      }
    }, 400);
  });
}

/* True when this document is the sign-in popup on its way back, rather than
   the page the user is reading. Both conditions matter: without the state
   marker, a normal tab that happens to have an opener would be mistaken for
   the popup and closed under the user. */
export function isOAuthPopup(): boolean {
  if (!window.opener) {
    return false;
  }
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("session") && !params.has("error")) {
    return false;
  }
  return params.get("state")?.startsWith(POPUP_STATE_PREFIX) === true;
}

/* Runs in the popup. Hands the result to the opener, which owns the stored
   state and therefore does the verifying, then closes. */
export function relayToOpener(): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const message: AuthMessage = {
    type: AUTH_MESSAGE,
    session: params.get("session"),
    state: params.get("state"),
    error: params.get("error"),
  };
  window.opener?.postMessage(message, window.location.origin);
  window.close();
}

function clearFragment(): void {
  history.replaceState(null, "", location.pathname + location.search);
}

function takeStoredState(): string | null {
  try {
    const stored = window.sessionStorage.getItem(STATE_KEY);
    window.sessionStorage.removeItem(STATE_KEY);
    return stored;
  } catch {
    return null;
  }
}

/** The page a redirect sign-in started from, read once. Accepts only a
    same-origin path: a leading "//" would be a protocol-relative URL to
    another host, and so would "/\", because browsers read a backslash in a
    URL as a slash. */
export function takeReturnPath(): string | null {
  let path: string | null = null;
  try {
    path = window.sessionStorage.getItem(RETURN_PATH_KEY);
    window.sessionStorage.removeItem(RETURN_PATH_KEY);
  } catch {
    return null;
  }
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
    return null;
  }
  return path;
}

/* Validates a returned session and stores it, or throws with a message fit to
   show the user. Shared by the popup and full-page paths so the checks cannot
   drift apart.

   State is matched against what we stored before leaving, which gives CSRF
   protection without n8n having to store anything. It is verified here, in the
   window that opened the flow, because that is the window holding the value —
   sessionStorage copying into popups is not something to depend on. */
function completeSignIn(
  token: string | null,
  returnedState: string | null,
  error: string | null,
): SessionUser {
  const expectedState = takeStoredState();

  if (error) {
    throw new Error(`Google sign-in failed: ${error}`);
  }
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("Sign-in could not be verified. Please try again.");
  }

  const claims = token ? decodeClaims(token) : null;
  if (!token || !claims) {
    throw new Error("Sign-in returned an unreadable session.");
  }
  if (isExpired(claims)) {
    throw new Error("That session had already expired.");
  }

  try {
    window.localStorage.setItem(SESSION_KEY, token);
  } catch {
    throw new Error("Could not save your session — storage is blocked.");
  }
  return { ...claims };
}

/* Called once on boot, for the popup-blocked fallback where the callback
   workflow redirected this window to `/#session=<jwt>&state=<state>`. */
export function consumeRedirect(): RedirectOutcome {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) {
    return { kind: "none" };
  }
  const params = new URLSearchParams(hash);
  const error = params.get("error");
  const token = params.get("session");
  if (!error && !token) {
    /* An ordinary in-page anchor such as #polls. Leave it alone. */
    return { kind: "none" };
  }

  clearFragment();

  try {
    return {
      kind: "signed-in",
      user: completeSignIn(token, params.get("state"), error),
    };
  } catch (failure) {
    return {
      kind: "error",
      message: failure instanceof Error ? failure.message : "Sign-in failed.",
    };
  }
}
