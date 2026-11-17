import * as THREE from 'three';
import { markShared } from './Disposer.js';

/**
 * Загрузка ассетов по манифесту (assets/assets.manifest.json — единственный источник правды).
 *  - ключ → запись {type, file, status, optional, ...};
 *  - записи со status Missing не грузятся и не ломают сцену: get(key) вернёт null,
 *    сцена обязана иметь запасной вариант (процедурную заглушку или пропуск объекта);
 *  - повторная загрузка того же ключа берёт кэш; одновременные запросы дедуплицируются;
 *  - GLTF/DRACO подгружаются лениво (dynamic import) — старт без моделей их не требует;
 *  - ресурсы из кэша помечаются userData.shared и не освобождаются сценой (см. Disposer).
 */
export class AssetManager {
  constructor(renderer, { baseUrl = 'assets/' } = {}) {
    this.renderer = renderer;
    this.baseUrl = baseUrl;
    this.manifest = {};
    this.cache = new Map();
    this._pending = new Map();
    this.missing = new Set();
    this.errors = [];
    this._gltf = null;
    this._tex = new THREE.TextureLoader();
  }

  /** Возвращает true, если манифест загружен. Иначе — громкая ошибка в консоль и работа без внешних ассетов. */
  async init(manifestUrl = `${this.baseUrl}assets.manifest.json`) {
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} для ${new URL(manifestUrl, document.baseURI).pathname}`);
      this.manifest = (await res.json()).assets ?? {};
      return true;
    } catch (e) {
      this.errors.push({ key: '(manifest)', message: String(e) });
      console.error(`[AssetManager] манифест ассетов не загружен — внешние ассеты недоступны, работаем на процедурной графике. Причина: ${e.message}`);
      return false;
    }
  }

  /** Человекочитаемое описание ключа для сообщений об ошибках. */
  describe(key) {
    const e = this.manifest[key];
    if (!e) return `${key} (нет в манифесте)`;
    return `${key} — ${e.purpose ?? '?'}; файл assets/${e.file ?? '—'}; как получить: ${e.source ?? '—'}`;
  }

  /** Сводка по текущему состоянию (для отладки и тестов). */
  report() {
    return { loaded: [...this.cache.keys()], missing: [...this.missing], errors: this.errors.map((e) => ({ ...e })) };
  }

  /**
   * Бросает понятную ошибку, если какой-то из критичных ассетов не загружен.
   * Критичный = без него сцена не имеет смысла (в отличие от декоративных, для которых есть запасной вариант).
   */
  require(keys) {
    const bad = keys.filter((k) => !this.cache.has(k));
    if (!bad.length) return;
    const why = bad.map((k) => `\n • ${this.describe(k)}${this.errors.find((e) => e.key === k) ? ` [ошибка загрузки: ${this.errors.find((e) => e.key === k).message}]` : ' [файла нет]'}`).join('');
    throw new Error(`Критичные ассеты недоступны:${why}`);
  }

  has(key) { return this.cache.has(key); }
  get(key) { return this.cache.get(key) ?? null; }

  /** Клон GLTF-сцены для повторного использования (для скинированных моделей понадобится SkeletonUtils). */
  instance(key) {
    const g = this.get(key);
    return g?.scene ? g.scene.clone(true) : null;
  }

  async load(keys, onProgress) {
    const list = [...new Set(keys)];
    if (!list.length) { onProgress?.(1); return; }
    let done = 0;
    await Promise.all(list.map((k) =>
      this._loadOne(k)
        .catch((e) => {
          const msg = e?.message ?? String(e);
          this.errors.push({ key: k, message: msg });
          console.error(`[AssetManager] не удалось загрузить ${this.describe(k)} — ${msg}`);
        })
        .finally(() => onProgress?.(++done / list.length, k))
    ));
  }

  _loadOne(key) {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this._pending.has(key)) return this._pending.get(key);
    const e = this.manifest[key];
    if (!e) return Promise.reject(new Error('ключ отсутствует в манифесте'));
    if (String(e.status).toLowerCase() === 'missing' || !e.file) {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        console.warn(`[AssetManager] ассет отсутствует (status Missing): ${this.describe(key)}`);
      }
      return Promise.resolve(null);
    }
    const p = this._read(e).then((v) => { this.cache.set(key, v); this._pending.delete(key); return v; },
                                 (err) => { this._pending.delete(key); throw err; });
    this._pending.set(key, p);
    return p;
  }

  async _read(e) {
    const url = this.baseUrl + e.file;
    switch (e.type) {
      case 'gltf': {
        const loader = await this._gltfLoader();
        const gltf = await loader.loadAsync(url);
        markShared(gltf.scene);
        return gltf;
      }
      case 'texture': {
        const t = await this._tex.loadAsync(url);
        t.colorSpace = e.colorSpace === 'linear' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        t.userData.shared = true;
        return t;
      }
      case 'audio': {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      }
      case 'json': {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }
      default: throw new Error(`неизвестный тип ассета: ${e.type}`);
    }
  }

  async _gltfLoader() {
    if (this._gltf) return this._gltf;
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ]);
    const draco = new DRACOLoader().setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/');
    this._gltf = new GLTFLoader().setDRACOLoader(draco);
    return this._gltf;
  }

  /** Принудительно освободить ассеты (например, после ухода из сцены, которая единственная ими пользовалась). */
  release(keys) {
    for (const k of keys) {
      const v = this.cache.get(k);
      if (!v) continue;
      if (v.isTexture) v.dispose();
      else if (v.scene) v.scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material ?? [])) {
          for (const p in m) if (m[p]?.isTexture) m[p].dispose();
          m.dispose();
        }
      });
      this.cache.delete(k);
    }
  }

  dispose() { this.release([...this.cache.keys()]); this._gltf?.dracoLoader?.dispose(); }
}
