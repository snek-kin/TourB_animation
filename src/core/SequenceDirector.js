/**
 * Orchestrates registered scenes on the application's existing frame loop.
 * Segments accept { scene, duration?, transition?, transitionDuration?, cues?, cameraKeyframes?, loop? };
 * cues use { at, run } (or { time, callback }).
 */
export class SequenceDirector {
  constructor(sceneManager, { cameraController = null, onCue = null, onStateChange = null, sequence = null } = {}) {
    if (!sceneManager) throw new TypeError('SequenceDirector requires a SceneManager');
    this.scenes = sceneManager;
    this.cameraController = cameraController;
    this.onCue = onCue;
    this.onStateChange = onStateChange;
    this._configuredSequence = sequence;
    this._segments = [];
    this.index = -1;
    this.elapsed = 0;
    this.state = 'stopped';
    this.ownsTimeline = false;
    this._firedCues = new Set();
    this._disposed = false;
  }

  get active() { return this.state === 'playing' || this.state === 'transitioning'; }

  _buildSegments() {
    const source = this._configuredSequence ?? this.scenes.defs.map((def) => ({
      scene: def.id,
      transition: def.transition,
      loop: def.loop,
    }));
    if (!Array.isArray(source) || source.length === 0)
      throw new TypeError('SequenceDirector requires at least one sequence segment');
    this._segments = source.map((segment, index) => {
      const sceneIndex = typeof segment.scene === 'number'
        ? segment.scene
        : this.scenes.defs.findIndex((def) => def.id === segment.scene);
      if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= this.scenes.defs.length)
        throw new RangeError(`Sequence segment ${index} references an unknown scene`);
      if (segment.duration != null && (!Number.isFinite(segment.duration) || segment.duration <= 0))
        throw new RangeError(`Sequence segment ${index} duration must be greater than zero`);
      if (segment.transitionDuration != null &&
          (!Number.isFinite(segment.transitionDuration) || segment.transitionDuration <= 0))
        throw new RangeError(`Sequence segment ${index} transitionDuration must be greater than zero`);
      const cues = (segment.cues ?? []).map((cue, cueIndex) => {
        const time = cue.time ?? cue.at;
        const callback = cue.callback ?? cue.run;
        if (!Number.isFinite(time) || time < 0 || typeof callback !== 'function')
          throw new TypeError(`Sequence segment ${index} cue ${cueIndex} requires a non-negative time and callback`);
        if (segment.duration != null && time > segment.duration)
          throw new RangeError(`Sequence segment ${index} cue ${cueIndex} falls after its duration`);
        return { ...cue, time, callback };
      }).sort((a, b) => a.time - b.time);
      return { ...segment, sceneIndex, cues };
    });
    return this._segments;
  }

  _setState(state) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this.onStateChange?.({ state, previous, director: this });
  }

  async start(index = 0, { transition = 'cut' } = {}) {
    if (this._disposed) throw new Error('SequenceDirector has been disposed');
    if (this.scenes.busy) return this.getProgress();
    const segments = this._buildSegments();
    if (!Number.isInteger(index) || index < 0 || index >= segments.length)
      throw new RangeError(`Sequence segment index is out of range: ${index}`);
    this.scenes.paused = false;
    this.scenes.ended = false;
    this.scenes.app.hud?.setPaused(false);
    this.ownsTimeline = true;
    this.index = index;
    this.elapsed = 0;
    this._firedCues.clear();
    this.cameraController?.release();
    this._setState('transitioning');
    await this.scenes.goTo(segments[index].sceneIndex, {
      transition,
      duration: segments[index].transitionDuration,
    });
    if (this._disposed || this.state !== 'transitioning') return this.getProgress();
    if (this.scenes.current?.id !== this.scenes.defs[segments[index].sceneIndex].id) {
      this._setState('stopped');
      return this.getProgress();
    }
    this.elapsed = 0;
    this._setState('playing');
    this._startSegment();
    return this.getProgress();
  }

  play() {
    if (this.state === 'paused') return this.resume();
    if (this.state === 'playing') return this.getProgress();
    return this.start(this.index < 0 ? 0 : this.index);
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.scenes.paused = true;
    this.scenes.app.hud?.setPaused(true);
    this._setState('paused');
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.scenes.paused = false;
    this.scenes.app.hud?.setPaused(false);
    this._setState('playing');
    return true;
  }

  async skip() {
    if (this._disposed || this.index < 0 || this.index >= this._segments.length - 1) return false;
    return this._navigate(this.index + 1);
  }

  async previous() {
    if (this._disposed || this.index <= 0) return false;
    return this._navigate(this.index - 1, { transition: 'cut' });
  }

  async restart() {
    return this.start(0);
  }

  stop() {
    if (this.state === 'stopped' || this.state === 'ended') return false;
    this.scenes.paused = true;
    this.scenes.app.hud?.setPaused(false);
    this.scenes.app.transitions?.cancel?.();
    this.cameraController?.release();
    this._setState('stopped');
    return true;
  }

  async _navigate(index, { transition, duration } = {}) {
    if (this.scenes.busy || this._disposed) return false;
    const segment = this._segments[index];
    const resumeAfter = this.state === 'paused';
    this.scenes.paused = false;
    this.scenes.app.hud?.setPaused(false);
    this.cameraController?.release();
    this._setState('transitioning');
    await this.scenes.goTo(segment.sceneIndex, {
      transition: transition ?? segment.transition,
      duration: duration ?? segment.transitionDuration,
    });
    if (this._disposed || this.state !== 'transitioning') return false;
    if (this.scenes.current?.id !== this.scenes.defs[segment.sceneIndex].id) {
      this._setState('stopped');
      return false;
    }
    this.index = index;
    this.elapsed = 0;
    this._firedCues.clear();
    this._setState('playing');
    this._startSegment();
    if (resumeAfter && this.state === 'playing') {
      this.scenes.paused = true;
      this.scenes.app.hud?.setPaused(true);
      this._setState('paused');
    }
    return true;
  }

  _startSegment() {
    const segment = this._segments[this.index];
    if (this.scenes.current && segment.resolvedDuration == null)
      segment.resolvedDuration = this.scenes.current.duration;
    try {
      if (segment.cameraKeyframes) this.cameraController?.playKeyframes(segment.cameraKeyframes);
    } catch (error) {
      this.scenes.app.reportError?.(error);
      this._setState('stopped');
      return;
    }
    this._fireCues(0);
  }

  _durationFor(segment) {
    if (segment.duration != null) return segment.duration;
    if (segment.resolvedDuration != null) return segment.resolvedDuration;
    if (this.scenes.current?.id === this.scenes.defs[segment.sceneIndex].id) return this.scenes.current.duration;
    if (this.scenes._next?.index === segment.sceneIndex) return this.scenes._next.scene.duration;
    return null;
  }

  _fireCues(time) {
    const segment = this._segments[this.index];
    segment.cues.forEach((cue, cueIndex) => {
      const key = `${this.index}:${cueIndex}`;
      if (cue.time > time || this._firedCues.has(key)) return;
      this._firedCues.add(key);
      const event = { segment: this.index, scene: this.scenes.current, time: cue.time, director: this };
      try {
        const result = cue.callback(event);
        if (result?.then) result.catch((error) => this.scenes.app.reportError?.(error));
        this.onCue?.({ ...event, cue });
      } catch (error) {
        this.scenes.app.reportError?.(error);
      }
    });
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('SequenceDirector delta must be a non-negative number');
    if (this.state !== 'playing' || this.scenes.busy || this.scenes.paused || !this.scenes.current) return 0;
    const segment = this._segments[this.index];
    const duration = this._durationFor(segment) ?? this.scenes.current.duration;
    const previous = this.elapsed;
    this.elapsed = Math.min(duration, this.elapsed + dt);
    this.scenes.update(this.elapsed - previous, { autoAdvance: false });
    this._fireCues(this.elapsed);
    if (this.elapsed >= duration) {
      if (this.index < this._segments.length - 1) this._navigate(this.index + 1);
      else if (segment.loop) this.restart();
      else {
        this.scenes.ended = true;
        this.scenes.app.hud?.setEnded();
        this._setState('ended');
      }
    }
    return this.elapsed - previous;
  }

  getProgress() {
    const segment = this._segments[this.index];
    const duration = segment ? this._durationFor(segment) ?? 0 : 0;
    const segmentProgress = duration > 0 ? Math.min(1, this.elapsed / duration) : 0;
    const durations = this._segments.map((item) => this._durationFor(item));
    const completedDuration = durations.slice(0, Math.max(0, this.index))
      .reduce((sum, item) => sum + (item ?? 0), 0);
    const totalDuration = durations.every((item) => item != null)
      ? durations.reduce((sum, item) => sum + item, 0)
      : null;
    return {
      state: this.state,
      index: this.index,
      count: this._segments.length,
      sceneId: this.scenes.current?.id ?? null,
      elapsed: this.elapsed,
      duration,
      segmentProgress,
      sequenceProgress: totalDuration > 0
        ? Math.min(1, (completedDuration + this.elapsed) / totalDuration)
        : null,
    };
  }

  getState() { return this.getProgress(); }

  dispose() {
    if (this._disposed) return;
    this.stop();
    this._disposed = true;
    this.onCue = null;
    this.onStateChange = null;
    this._segments = [];
  }
}
