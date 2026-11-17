"""Общая обвязка для браузерных проверок (Python + Playwright, Chromium).
Эти тесты НЕ нужны для запуска презентации; они нужны, чтобы проверять проект автоматически.
Запуск (нужен `pip install playwright` и установленный Chromium):  python3 tests/browser/audit.py
ВАЖНО: в контейнере без видеокарты Chromium рисует программно (SwiftShader) — FPS из таких прогонов
НЕ отражает реальную видеокарту. Для реальных цифр используйте `?bench=60` в обычном браузере (см. README)."""
import asyncio, contextlib, json, socket, subprocess, sys, time, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                 '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']

def _free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

@contextlib.contextmanager
def serve(root=ROOT):
    port = _free_port()
    proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(root)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
        except OSError: time.sleep(0.1)
    try: yield port
    finally: proc.terminate()

class Session:
    """Страница + сбор консоли, сетевых ответов 4xx/5xx, внешних запросов и исключений."""
    def __init__(self, port, viewport=(1280, 720)):
        self.port, self.viewport = port, viewport
        self.console, self.errors, self.bad_responses, self.requests = [], [], [], []

    async def __aenter__(self):
        self._pw = await async_playwright().start()
        self.browser = await self._pw.chromium.launch(args=CHROMIUM_ARGS)
        self.page = await self.browser.new_page(viewport={'width': self.viewport[0], 'height': self.viewport[1]})
        p = self.page
        p.on('console', lambda m: self.console.append({'type': m.type, 'text': m.text}))
        p.on('pageerror', lambda e: self.errors.append(str(e)))
        p.on('request', lambda r: self.requests.append(r.url))
        p.on('response', lambda r: self.bad_responses.append({'status': r.status, 'url': r.url}) if r.status >= 400 else None)
        p.on('requestfailed', lambda r: self.bad_responses.append({'status': 'FAILED', 'url': r.url}))
        return self

    async def __aexit__(self, *a):
        await self.browser.close(); await self._pw.stop()

    async def open(self, query='', start=True, timeout=60000):
        await self.page.goto(f'http://127.0.0.1:{self.port}/index.html{query}')
        await self.page.wait_for_selector('#start:not([hidden]), #error:not([hidden])', timeout=timeout)
        if start and await self.page.query_selector('#start:not([hidden])'):
            await self.page.click('#start'); await self.page.wait_for_timeout(500)

    def ev(self, js): return self.page.evaluate(js)
    async def shot(self, path): await self.page.screenshot(path=str(path))

    def problems(self):
        """Всё, что считаем дефектом: ошибки консоли, исключения, 4xx/5xx и сетевые сбои."""
        errs = [c['text'] for c in self.console if c['type'] in ('error',)]
        warns = [c['text'] for c in self.console if c['type'] == 'warning']
        return {'console_errors': errs, 'console_warnings': warns, 'page_errors': self.errors, 'bad_responses': self.bad_responses}

    def external_requests(self):
        return [u for u in self.requests if not u.startswith(f'http://127.0.0.1:{self.port}') and not u.startswith('data:') and not u.startswith('blob:')]
