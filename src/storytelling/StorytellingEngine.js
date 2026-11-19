import * as THREE from 'three';
import { HotspotManager } from './HotspotManager.js';
import { ObjectHighlighter } from './ObjectHighlighter.js';
import { StoryPanel } from './StoryPanel.js';

function abortError() {
  const error = new Error('Story action was cancelled');
  error.name = 'AbortError';
  return error;
}

function vector(value, label) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    return new THREE.Vector3(...value);
  throw new TypeError(`${label} must be a Vector3 or a three-number array`);
}

function targetPosition(target, label) {
  if (target?.isObject3D) {
    target.updateWorldMatrix(true, false);
    return target.getWorldPosition(new THREE.Vector3());
  }
  return vector(target, label);
}

const BUILT_IN_ACTIONS = ['camera', 'focus', 'highlight', 'panel', 'title', 'statistics', 'event', 'wait', 'interaction'];

export class StorytellingEngine {
  constructor(app, { document = globalThis.document } = {}) {
    if (!app?.renderer?.domElement || !app.camera || !app.cinematicCamera || !app.director || !app.scenes)
      throw new TypeError('StorytellingEngine requires an initialized TourB App');
    this.app = app;
    this.stories = new Map();
    this.state = 'stopped';
    this.story = null;
    this.chapterIndex = -1;
    this.stepIndex = -1;
    this._flatSteps = [];
    this._activeStep = null;
    this._presentation = null;
    this._currentHint = '';
    this._actionAbort = null;
    this._runToken = 0;
    this._waiters = new Set();
    this._interactionWaiter = null;
    this._registeredHotspots = [];
    this._cameraSnapshot = null;
    this._sceneRef = null;
    this._directorWasPlaying = false;
    this._wasScenePaused = false;
    this._listeners = new Map();
    this._disposed = false;
    this.highlighter = new ObjectHighlighter();
    this.panel = new StoryPanel({
      stage: app.stage,
      document,
      onNext: () => this.next(),
      onPrevious: () => this.previous(),
      onClose: () => this.stop(),
      onRestart: () => this.restart(),
    });
    this.hotspots = new HotspotManager({
      element: app.renderer.domElement,
      stage: app.stage,
      camera: app.camera,
      onHover: (entry) => this._hover(entry),
      onActivate: (entry) => this._activateHotspot(entry),
      onError: (error) => this.app.reportError?.(error),
    });
    this.actions = new Map([
      ['camera', (action, signal) => this._camera(action, signal)],
      ['focus', (action, signal) => this._focus(action, signal)],
      ['highlight', (action) => this._highlight(action)],
      ['panel', (action) => this._setPresentation(action.content ?? action)],
      ['title', (action) => this._setPresentation({ title: action.title, subtitle: action.subtitle })],
      ['statistics', (action) => this._setPresentation({ facts: action.facts, statistics: action.statistics })],
      ['event', (action) => this._emitPresentationEvent(action)],
      ['wait', (action, signal) => this._wait(action.duration, signal)],
      ['interaction', (action, signal) => this._waitForInteraction(action, signal)],
    ]);
  }

  register(story) {
    if (this._disposed) throw new Error('StorytellingEngine has been disposed');
    if (!story || typeof story.id !== 'string' || !story.id.trim())
      throw new TypeError('A story requires a non-empty id');
    if (this.stories.has(story.id)) throw new Error(`Story already registered: ${story.id}`);
    if (!Array.isArray(story.chapters) || story.chapters.length === 0)
      throw new TypeError(`Story "${story.id}" requires at least one chapter`);
    const chapterIds = new Set();
    const stepIds = new Set();
    for (const [chapterIndex, chapter] of story.chapters.entries()) {
      if (!chapter?.id || chapterIds.has(chapter.id))
        throw new TypeError(`Story "${story.id}" has a missing or duplicate chapter id at ${chapterIndex}`);
      chapterIds.add(chapter.id);
      if (!Array.isArray(chapter.steps) || chapter.steps.length === 0)
        throw new TypeError(`Chapter "${chapter.id}" requires at least one step`);
      for (const [stepIndex, step] of chapter.steps.entries()) {
        if (!step?.id || stepIds.has(step.id))
          throw new TypeError(`Story "${story.id}" has a missing or duplicate step id at ${chapterIndex}:${stepIndex}`);
        stepIds.add(step.id);
        if (step.actions != null && !Array.isArray(step.actions))
          throw new TypeError(`Step "${step.id}" actions must be an array`);
        for (const action of step.actions ?? []) {
          if (!action || !this.actions.has(action.type))
            throw new TypeError(`Step "${step.id}" uses an unknown action: ${action?.type}`);
          if (action.type === 'wait' && (!Number.isFinite(action.duration) || action.duration < 0))
            throw new RangeError(`Wait action in "${step.id}" requires a non-negative duration`);
        }
      }
    }
    for (const hotspot of story.hotspots ?? []) {
      if (!hotspot?.id || (hotspot.position == null && !hotspot.object))
        throw new TypeError(`Story "${story.id}" hotspots require an id and an object or position`);
    }
    this.stories.set(story.id, story);
    if (this.stories.size === 1) this.panel.setLaunch(() => this.start(story.id), story.launchLabel ?? `Découvrir · ${story.title ?? story.id}`);
    return this;
  }

  registerAction(type, handler) {
    if (this._disposed) throw new Error('StorytellingEngine has been disposed');
    if (typeof type !== 'string' || !type.trim() || typeof handler !== 'function')
      throw new TypeError('Custom story actions require a name and a handler');
    if (this.actions.has(type)) throw new Error(`Story action already registered: ${type}`);
    this.actions.set(type, handler);
    return () => this.actions.delete(type);
  }

  setAvailable(available) { this.panel.setAvailable(available); }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') throw new TypeError('Story event listener must be a function');
    const listeners = this._listeners.get(type) ?? new Set();
    listeners.add(listener);
    this._listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this._listeners.delete(type);
    };
  }

  start(id) {
    if (this._disposed) throw new Error('StorytellingEngine has been disposed');
    const story = this.stories.get(id);
    if (!story) throw new RangeError(`Unknown story: ${id}`);
    if (!this.app.scenes.current) throw new Error('A scene must be running before a story can start');
    if (this.app.director.state === 'transitioning')
      throw new Error('A story cannot start during a scene transition');
    if (this.story) {
      this._cancelActions();
      this._endSession(false);
    }

    this.story = story;
    this._flatSteps = story.chapters.flatMap((chapter, chapterIndex) =>
      chapter.steps.map((step, stepIndex) => ({ chapter, chapterIndex, step, stepIndex })));
    this.chapterIndex = 0;
    this.stepIndex = 0;
    this._sceneRef = this.app.scenes.current.scene;
    this._directorWasPlaying = this.app.director.state === 'playing';
    this._wasScenePaused = this.app.scenes.paused;
    this._cameraSnapshot = this.app.cinematicCamera.suspend?.() ?? null;
    if (this._directorWasPlaying) this.app.director.pause();
    else this.app.scenes.paused = true;
    this.app.hud?.setPaused(false);
    this._registerStoryHotspots(story);
    this._setState('playing');
    this._runCurrentStep();
    return this.getState();
  }

  pause() {
    if (!this.story || this.state === 'paused' || this.state === 'ended' || this.state === 'stopped') return false;
    this._resumeState = this.state;
    this.state = 'paused';
    this.app.cinematicCamera.pause?.();
    this.panel.setState('paused', { waitingInteraction: Boolean(this._interactionWaiter) });
    this._notifyState();
    return true;
  }

  resume() {
    if (!this.story || this.state !== 'paused') return false;
    this.app.cinematicCamera.resume?.();
    this.state = this._resumeState ?? 'playing';
    this.panel.setState(this.state, { waitingInteraction: Boolean(this._interactionWaiter) });
    this.panel.setHint(this.state === 'awaiting-input' ? this._currentHint : '');
    this._notifyState();
    return true;
  }

  next() {
    if (!this.story || this.state === 'ended' || this.state === 'stopped') return false;
    if (this._interactionWaiter) return false;
    return this._moveTo(this._flatSteps.findIndex((entry) =>
      entry.chapterIndex === this.chapterIndex && entry.stepIndex === this.stepIndex) + 1);
  }

  previous() {
    if (!this.story || this.state === 'stopped' || this.stepIndex === 0 && this.chapterIndex === 0) return false;
    const current = this._flatSteps.findIndex((entry) =>
      entry.chapterIndex === this.chapterIndex && entry.stepIndex === this.stepIndex);
    return this._moveTo(current - 1);
  }

  restart() {
    if (!this.story) return false;
    if (this.state === 'ended') {
      this.start(this.story.id);
      return true;
    }
    const paused = this.state === 'paused';
    this._moveTo(0);
    if (paused) {
      this._resumeState = this.state;
      this.state = 'paused';
      this.app.cinematicCamera.pause?.();
      this.panel.setState('paused');
    }
    return true;
  }

  stop() {
    if (!this.story) return false;
    this._cancelActions();
    this._endSession(true);
    this.story = null;
    this._flatSteps = [];
    this.chapterIndex = -1;
    this.stepIndex = -1;
    this._setState('stopped');
    this.panel.close();
    return true;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('StorytellingEngine delta must be non-negative');
    if (!this.story) return;
    if (this._sceneRef && this.app.scenes.current?.scene !== this._sceneRef) {
      this.stop();
      this.hotspots.clear();
      return;
    }
    if (this.state === 'paused') return;

    this.app.cinematicCamera.update(dt);
    this.highlighter.update();
    for (const waiter of [...this._waiters]) {
      if (waiter.duration != null) waiter.remaining -= dt;
      let done = waiter.duration != null ? waiter.remaining <= 0 : false;
      if (waiter.predicate) done = waiter.predicate();
      if (done) waiter.finish();
    }
  }

  getState() {
    const current = this._flatSteps.find((entry) =>
      entry.chapterIndex === this.chapterIndex && entry.stepIndex === this.stepIndex);
    return {
      state: this.state,
      storyId: this.story?.id ?? null,
      chapterId: current?.chapter.id ?? null,
      chapterIndex: current?.chapterIndex ?? -1,
      stepId: current?.step.id ?? null,
      stepIndex: current?.stepIndex ?? -1,
      stepCount: this._flatSteps.length,
    };
  }

  _moveTo(index) {
    const paused = this.state === 'paused';
    if (index >= this._flatSteps.length) {
      this._cancelActions();
      this.chapterIndex = this._flatSteps.at(-1).chapterIndex;
      this.stepIndex = this._flatSteps.at(-1).stepIndex;
      this._endSession(false);
      this._setState('ended');
      this._renderCurrentStep();
      return true;
    }
    if (index < 0) return false;
    this._cancelActions();
    const entry = this._flatSteps[index];
    this.chapterIndex = entry.chapterIndex;
    this.stepIndex = entry.stepIndex;
    if (paused) this._resumeState = 'playing';
    else this._setState('playing');
    this._runCurrentStep();
    return true;
  }

  _runCurrentStep() {
    const current = this._flatSteps.find((entry) =>
      entry.chapterIndex === this.chapterIndex && entry.stepIndex === this.stepIndex);
    if (!current) return;
    this._activeStep = current;
    this._presentation = {
      title: current.step.title ?? current.chapter.title ?? this.story.title,
      subtitle: current.step.subtitle ?? '',
      description: current.step.description ?? '',
      image: current.step.image ?? null,
      facts: current.step.facts ?? [],
      statistics: current.step.statistics ?? [],
    };
    this._renderCurrentStep();
    const controller = new AbortController();
    this._actionAbort = controller;
    const token = ++this._runToken;
    if (this.state !== 'paused') this._setState('playing');
    this._executeActions(current.step.actions ?? [], controller.signal, token);
  }

  async _executeActions(actions, signal, token) {
    try {
      for (const action of actions) {
        if (signal.aborted) return;
        const handler = this.actions.get(action.type);
        await handler(action, signal, this._actionContext());
      }
      if (signal.aborted || token !== this._runToken) return;
      if (this.state === 'paused') this._resumeState = 'awaiting-input';
      else this._setState('awaiting-input');
      this.panel.setState(this.state === 'paused' ? this._resumeState : this.state, {
        waitingInteraction: Boolean(this._interactionWaiter),
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      this.app.reportError?.(error);
      this._endSession(false);
      this._setState('error');
    }
  }

  _actionContext() {
    return {
      app: this.app,
      engine: this,
      story: this.story,
      chapter: this._activeStep?.chapter,
      step: this._activeStep?.step,
      scene: this.app.scenes.current?.scene,
      signal: this._actionAbort?.signal,
    };
  }

  async _camera(action, signal) {
    const pose = { ...action.pose };
    if (action.position != null) pose.position = action.position;
    if (action.target != null) pose.target = action.target;
    if (!pose.position && !pose.target && pose.fov == null)
      throw new TypeError('Camera story action requires position, target, or fov');
    this.app.cinematicCamera.animateTo(pose, { duration: action.duration ?? 1, ease: action.ease ?? 'sine.inOut' });
    if (this.state === 'paused') this.app.cinematicCamera.pause?.();
    const abort = () => this.app.cinematicCamera.cancel({ release: true });
    signal.addEventListener('abort', abort, { once: true });
    try {
      await this._waitFor(() => !this.app.cinematicCamera.getState().active, signal);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  async _focus(action, signal) {
    const target = this._resolveTarget(action.target);
    const point = targetPosition(target?.object ?? target, 'Focus target');
    const offset = vector(action.offset ?? [0, 8, 14], 'Focus offset');
    await this._camera({
      position: point.clone().add(offset).toArray(),
      target: point.toArray(),
      fov: action.fov,
      duration: action.duration,
      ease: action.ease,
    }, signal);
  }

  _highlight(action) {
    const target = this._resolveTarget(action.target);
    const scene = this.app.scenes.current?.scene;
    if (!this.highlighter.highlight(target?.object ?? target?.position ?? target, scene, action.color))
      throw new Error('Cannot highlight a target without an active scene');
  }

  _resolveTarget(target) {
    if (typeof target !== 'string') return target;
    const hotspot = this.hotspots.get(target) ??
      this.hotspots.get(`${this.story?.id}:${target}`);
    if (!hotspot) throw new RangeError(`Unknown storytelling target: ${target}`);
    return hotspot.object ?? hotspot.position;
  }

  _setPresentation(content) {
    this._presentation = { ...this._presentation, ...content };
    this._renderCurrentStep();
  }

  _renderCurrentStep() {
    if (!this._activeStep || !this.story) return;
    this.panel.show(this._presentation, {
      chapterTitle: this._activeStep.chapter.title ?? this._activeStep.chapter.id,
      chapterIndex: this.chapterIndex,
      chapterCount: this.story.chapters.length,
      stepIndex: this._flatSteps.findIndex((entry) =>
        entry.chapterIndex === this.chapterIndex && entry.stepIndex === this.stepIndex),
      stepCount: this._flatSteps.length,
      state: this.state,
    });
  }

  _wait(duration, signal) {
    return this._waitFor(null, signal, duration);
  }

  _waitFor(predicate, signal, duration = null) {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        duration,
        remaining: duration,
        finish: () => settle(resolve),
        reject: (error) => settle(() => reject(error)),
      };
      const abort = () => waiter.reject(abortError());
      const settle = (complete) => {
        this._waiters.delete(waiter);
        signal.removeEventListener('abort', abort);
        complete();
      };
      waiter.abort = abort;
      signal.addEventListener('abort', abort, { once: true });
      this._waiters.add(waiter);
    });
  }

  _waitForInteraction(action, signal) {
    if (signal.aborted) return Promise.reject(abortError());
    const id = action.hotspotId ?? null;
    if (this.state !== 'paused') this._setState('awaiting-interaction');
    this._currentHint = action.prompt ?? 'Выберите отмеченную точку, чтобы продолжить.';
    this.panel.setHint(this.state === 'paused' ? 'История на паузе' : this._currentHint);
    return new Promise((resolve, reject) => {
      const waiter = { id, resolve: () => settle(resolve), reject: () => settle(() => reject(abortError())) };
      const abort = () => waiter.reject();
      const settle = (complete) => {
        if (this._interactionWaiter === waiter) this._interactionWaiter = null;
        signal.removeEventListener('abort', abort);
        complete();
      };
      waiter.abort = abort;
      signal.addEventListener('abort', abort, { once: true });
      this._interactionWaiter = waiter;
    });
  }

  _activateHotspot(entry) {
    if (entry.content) this._setPresentation(entry.content);
    if (this._interactionWaiter && (!this._interactionWaiter.id || this._interactionWaiter.id === entry.id ||
        this._interactionWaiter.id === entry.id.replace(`${this.story?.id}:`, ''))) {
      this._interactionWaiter.resolve();
      if (this.state !== 'paused') this._setState('playing');
      this._currentHint = '';
      this.panel.setHint('');
    }
  }

  _hover(entry) {
    if (!entry) { this.highlighter.clear(); return; }
    const target = entry.object ?? entry.position;
    if (target) this.highlighter.highlight(target, this.app.scenes.current?.scene);
  }

  _registerStoryHotspots(story) {
    for (const hotspot of story.hotspots ?? []) {
      const id = `${story.id}:${hotspot.id}`;
      const unregister = this.hotspots.register({ ...hotspot, id });
      this._registeredHotspots.push(unregister);
    }
  }

  _emitPresentationEvent(action) {
    const detail = {
      name: action.name,
      payload: action.payload ?? null,
      storyId: this.story.id,
      chapterId: this._activeStep.chapter.id,
      stepId: this._activeStep.step.id,
    };
    for (const listener of this._listeners.get(action.name) ?? []) listener(detail);
    const EventType = globalThis.CustomEvent;
    if (EventType) this.app.stage?.dispatchEvent?.(new EventType('tourb:presentation-event', { detail }));
  }

  _cancelActions() {
    this._runToken++;
    this._actionAbort?.abort();
    this._actionAbort = null;
    this._interactionWaiter?.abort?.();
    this._interactionWaiter = null;
    for (const waiter of [...this._waiters]) waiter.abort?.();
    this.app.cinematicCamera.cancel({ release: true });
    this.highlighter.clear();
  }

  _endSession(closeHotspots) {
    for (const unregister of this._registeredHotspots.splice(0)) unregister();
    this.highlighter.clear();
    this.app.cinematicCamera.release();
    if (this._cameraSnapshot) this.app.cinematicCamera.restore?.(this._cameraSnapshot);
    this._cameraSnapshot = null;
    if (this._directorWasPlaying && this.app.director.state === 'paused') this.app.director.resume();
    else {
      this.app.scenes.paused = this._wasScenePaused;
      this.app.hud?.setPaused(this._wasScenePaused);
    }
    this._directorWasPlaying = false;
    this._sceneRef = null;
    if (closeHotspots) this._currentHint = '';
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.panel.setState(state);
    this._notifyState();
    this._renderCurrentStep();
  }

  _notifyState() {
    const event = { ...this.getState() };
    for (const listener of this._listeners.get('statechange') ?? []) listener(event);
  }

  dispose() {
    if (this._disposed) return;
    this._cancelActions();
    if (this.story) this._endSession(true);
    this.story = null;
    this._setState('stopped');
    this.hotspots.dispose();
    this.highlighter.dispose();
    this.panel.dispose();
    this.stories.clear();
    this.actions.clear();
    this._listeners.clear();
    this._disposed = true;
  }
}
