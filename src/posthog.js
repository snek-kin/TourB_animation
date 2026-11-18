// PostHog — необязательная аналитика презентации.
//
// Контракт: модуль никогда не бросает исключений и не блокирует запуск. Отсутствующая или неверная
// конфигурация, сбой загрузки скрипта, ошибка инициализации SDK или вызова capture только отключают
// аналитику; презентация продолжает работать.
//
// Конфигурация: классический скрипт runtime-config.js (в корне проекта) до src/main.js задаёт
//   globalThis.__TOURB_ENV__ = { POSTHOG_PROJECT_TOKEN: 'phc_…', POSTHOG_HOST: 'https://eu.i.posthog.com' };
// Значения читаются один раз, при вызове initializePostHog().

const MAX_PENDING = 100; // верхняя граница очереди событий, пока SDK загружается

// Свойства, которые SDK добавляет к каждому событию автоматически и которые для презентации не нужны:
// адрес страницы (может содержать query-параметры) и источник перехода.
const DROPPED_PROPERTIES = [
  '$current_url', '$pathname', '$referrer', '$referring_domain',
  '$initial_referrer', '$initial_referring_domain',
  '$exception', '$exception_list', '$exception_message', '$exception_type',
  '$exception_values', '$sentry_event_id', '$screen_height', '$screen_width',
];

let client = null;
let loading = false;
const pending = [];

function note(message, error) {
  // Только консоль: сбои аналитики не должны попадать в интерфейс презентации.
  try {
    console.warn('[posthog] ' + message, error ?? '');
  } catch {
    // Консоли нет — пропускаем молча.
  }
}

function isLocalhost() {
  const host = globalThis.location?.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isLocalhostUrl(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

// Возвращает { token, apiHost, scriptUrl } или { error }.
function readConfig() {
  const env = globalThis.__TOURB_ENV__;
  const token = typeof env?.POSTHOG_PROJECT_TOKEN === 'string' ? env.POSTHOG_PROJECT_TOKEN.trim() : '';
  const rawHost = typeof env?.POSTHOG_HOST === 'string' ? env.POSTHOG_HOST.trim() : '';
  if (!token) return { error: 'POSTHOG_PROJECT_TOKEN is not set' };
  if (!rawHost) return { error: 'POSTHOG_HOST is not set' };

  let url;
  try {
    url = new URL(rawHost);
  } catch {
    return { error: 'POSTHOG_HOST is not a valid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'POSTHOG_HOST must start with https:// or http://' };
  }
  if (url.username || url.password) return { error: 'POSTHOG_HOST must not contain credentials' };
  if (url.search || url.hash) return { error: 'POSTHOG_HOST must not contain a query or fragment' };
  if (url.protocol === 'http:' && !isLocalhostUrl(url.hostname)) {
    return { error: 'POSTHOG_HOST allows http:// only for localhost or 127.0.0.1' };
  }

  const apiHost = url.href.replace(/\/+$/, '');
  // Как в официальном сниппете PostHog: клиентский скрипт лежит на -assets-хосте (eu.i → eu-assets.i).
  // Для self-hosted и прокси без «.i.posthog.com» скрипт берётся с того же адреса.
  const assetsHost = apiHost.replace('.i.posthog.com', '-assets.i.posthog.com');
  return { token, apiHost, scriptUrl: assetsHost + '/static/array.js' };
}

// Если очистку не удалось выполнить, событие отбрасывается, а не уходит без очистки.
function beforeSend(event) {
  try {
    if (event?.event === '$exception') return null;
    const props = event?.properties;
    if (props) for (const key of DROPPED_PROPERTIES) delete props[key];
    return event;
  } catch (error) {
    note('before_send failed; event dropped', error);
    return null;
  }
}

let captureFailureReported = false;

function withClient(action) {
  try {
    if (client) action(client);
    else if (loading && pending.length < MAX_PENDING) pending.push(action);
  } catch (error) {
    // Один отчёт в консоль, дальше молча: иначе каждое нажатие клавиши давало бы предупреждение.
    if (!captureFailureReported) {
      captureFailureReported = true;
      note('event not sent (further failures are silent)', error);
    }
  }
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

function startClient(sdk, config) {
  if (typeof sdk?.init !== 'function') throw new Error('PostHog snippet did not define init()');
  sdk.init(config.token, {
    api_host: config.apiHost,
    // Закрепляем набор умолчаний SDK: обновления библиотеки не должны менять поведение молча.
    defaults: '2026-01-30',

    // Приватность: только явные события презентации, без автоматического сбора.
    autocapture: false,                  // без сбора кликов и текста элементов
    capture_pageview: false,             // без $pageview при загрузке
    capture_pageleave: false,            // без $pageleave
    person_profiles: 'identified_only',  // профили не создаются: пользователи не идентифицируются
    persistence: 'memory',               // без cookie и localStorage: идентификатор живёт только во вкладке
    disable_session_recording: true,     // запись сессий выключена: нет согласия и маскирования
    disable_surveys: true,               // скрипт опросов не загружаем
    before_send: beforeSend,

    capture_exceptions: {
      // Не отправляем необработанные исключения: их stack/message могут содержать URL или ввод пользователя.
      capture_unhandled_errors: false,
      capture_unhandled_rejections: false,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'tourb-cinematic-web',
      environment: isLocalhost() ? 'development' : 'production',
      serviceVersion: '0.1.0',
      captureConsoleLogs: false,
    },
  });
  client = sdk;
}

function finishLoading() {
  loading = false;
  // Если SDK не поднялся, client остаётся null и очередь молча сбрасывается.
  const queued = pending.splice(0);
  for (const action of queued) withClient(action);
}

export function initializePostHog() {
  try {
    const config = readConfig();
    if (config.error) {
      note(config.error + ' — analytics disabled');
      return;
    }

    loading = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = config.scriptUrl;
    script.onload = () => {
      try {
        startClient(globalThis.posthog, config);
      } catch (error) {
        client = null;
        note('SDK initialization failed — analytics disabled', error);
      } finally {
        finishLoading();
      }
    };
    script.onerror = () => {
      note('PostHog script failed to load — analytics disabled');
      loading = false;
      pending.length = 0;
    };
    (document.head ?? document.documentElement).append(script);
  } catch (error) {
    loading = false;
    pending.length = 0;
    note('initialization skipped', error);
  }
}
