// The static host must expose these public values as globalThis.__TOURB_ENV__ before this module runs.
const env = globalThis.__TOURB_ENV__;
const token = env?.POSTHOG_PROJECT_TOKEN;
const host = env?.POSTHOG_HOST;

let client = null;
let loading = false;
const pending = [];

function withClient(action) {
  if (client) action(client);
  else if (loading) pending.push(action);
}

export const posthog = {
  capture(...args) {
    withClient((sdk) => sdk.capture(...args));
  },
};

export const presentationLogger = {
  info(message, attributes) {
    withClient((sdk) => sdk.logger?.info(message, attributes));
  },
  error(message, attributes) {
    withClient((sdk) => sdk.logger?.error(message, attributes));
  },
};

function reportMissingConfiguration(name) {
  if (globalThis.location?.hostname === 'localhost' || globalThis.location?.hostname === '127.0.0.1') {
    queueMicrotask(() => {
      throw new Error(`${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`);
    });
  }
}

export function initializePostHog() {
  if (!token) {
    reportMissingConfiguration('POSTHOG_PROJECT_TOKEN');
    return;
  }

  if (!host) {
    reportMissingConfiguration('POSTHOG_HOST');
    return;
  }

  loading = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = new URL('/static/array.js', host).href;
  script.onload = () => {
    client = globalThis.posthog;
    client.init(token, {
      api_host: host,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      logs: {
        serviceName: 'tourb-cinematic-web',
        environment: globalThis.location?.hostname === 'localhost' || globalThis.location?.hostname === '127.0.0.1' ? 'development' : 'production',
        serviceVersion: '0.1.0',
      },
    });
    loading = false;
    for (const action of pending.splice(0)) action(client);
  };
  script.onerror = () => {
    loading = false;
    pending.length = 0;
  };
  document.head.append(script);
}
