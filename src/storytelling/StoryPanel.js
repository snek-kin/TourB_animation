function create(document, tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setItems(list, items, renderItem) {
  list.replaceChildren();
  for (const item of items ?? []) list.appendChild(renderItem(item));
  list.hidden = list.childElementCount === 0;
}

export class StoryPanel {
  constructor({ stage, document = globalThis.document, onNext, onPrevious, onClose, onRestart } = {}) {
    if (!document?.createElement || !stage?.appendChild)
      throw new TypeError('StoryPanel requires a document and a stage element');
    this.document = document;
    this.onNext = onNext;
    this.onPrevious = onPrevious;
    this.onClose = onClose;
    this.onRestart = onRestart;
    this._state = 'stopped';
    this._waitingInteraction = false;
    this._available = false;

    this.launcher = create(document, 'button', 'story-launcher', 'Открыть демо-историю');
    this.launcher.type = 'button';
    this.launcher.hidden = true;
    this.launcher.addEventListener('click', () => this.onLaunch?.());

    this.root = create(document, 'section', 'story-panel');
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Интерактивная история');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.inert = true;
    this.root.dataset.visible = 'false';

    const header = create(document, 'header', 'story-panel__header');
    this.progress = create(document, 'p', 'story-panel__progress');
    this.closeButton = create(document, 'button', 'story-panel__close', 'Закрыть');
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Закрыть историю');
    this.closeButton.addEventListener('click', () => this.onClose?.());
    header.append(this.progress, this.closeButton);

    this.title = create(document, 'h2', 'story-panel__title');
    this.subtitle = create(document, 'p', 'story-panel__subtitle');
    this.image = create(document, 'img', 'story-panel__image');
    this.image.hidden = true;
    this.description = create(document, 'p', 'story-panel__description');
    this.facts = create(document, 'ul', 'story-panel__facts');
    this.statistics = create(document, 'dl', 'story-panel__statistics');
    this.hint = create(document, 'p', 'story-panel__hint');

    const controls = create(document, 'footer', 'story-panel__controls');
    this.previousButton = create(document, 'button', 'story-panel__nav', 'Назад');
    this.previousButton.type = 'button';
    this.previousButton.addEventListener('click', () => this.onPrevious?.());
    this.nextButton = create(document, 'button', 'story-panel__nav story-panel__nav--primary', 'Далее');
    this.nextButton.type = 'button';
    this.nextButton.addEventListener('click', () => {
      if (this._state === 'ended') this.onRestart?.();
      else this.onNext?.();
    });
    controls.append(this.previousButton, this.nextButton);

    this.root.append(header, this.title, this.subtitle, this.image, this.description, this.facts,
      this.statistics, this.hint, controls);
    stage.append(this.launcher, this.root);
  }

  setLaunch(callback, title = 'Открыть демо-историю') {
    this.onLaunch = callback;
    this.launcher.textContent = title;
    this.launcher.hidden = !this._available || !callback;
  }

  setAvailable(available) {
    this._available = Boolean(available);
    this.launcher.hidden = !available || !this.onLaunch;
  }

  show(data, progress) {
    const {
      title = '', subtitle = '', description = '', image = null, facts = [], statistics = [],
    } = data ?? {};
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    this.subtitle.hidden = !subtitle;
    this.description.textContent = description;
    this.description.hidden = !description;

    if (image?.src) {
      this.image.src = image.src;
      this.image.alt = image.alt ?? '';
      this.image.hidden = false;
    } else {
      this.image.removeAttribute('src');
      this.image.alt = '';
      this.image.hidden = true;
    }

    setItems(this.facts, facts, (fact) => create(this.document, 'li', '', fact));
    setItems(this.statistics, statistics, (stat) => {
      const fragment = this.document.createDocumentFragment();
      fragment.append(
        create(this.document, 'dt', '', stat.label ?? ''),
        create(this.document, 'dd', '', stat.value ?? ''),
      );
      return fragment;
    });

    const { chapterTitle, chapterIndex, chapterCount, stepIndex, stepCount, state } = progress;
    this._state = state;
    this._waitingInteraction = state === 'awaiting-interaction';
    this.progress.textContent = `${chapterTitle} · Глава ${chapterIndex + 1}/${chapterCount} · Шаг ${stepIndex + 1}/${stepCount}`;
    this.previousButton.disabled = stepIndex === 0;
    this.nextButton.hidden = this._waitingInteraction;
    this.nextButton.textContent = state === 'ended' ? 'Повторить' : 'Далее';
    this.root.dataset.visible = 'true';
    this.root.setAttribute('aria-hidden', 'false');
    this.root.inert = false;
    this.launcher.hidden = true;
  }

  setHint(text = '') {
    this.hint.textContent = text;
    this.hint.hidden = !text;
  }

  setState(state, { waitingInteraction = this._waitingInteraction } = {}) {
    this._state = state;
    this._waitingInteraction = waitingInteraction || state === 'awaiting-interaction';
    this.root.dataset.state = state;
    this.nextButton.hidden = this._waitingInteraction;
  }

  close() {
    this.root.dataset.visible = 'false';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.inert = true;
    this.setHint('');
    this.launcher.hidden = !this._available || !this.onLaunch;
  }

  dispose() {
    this.launcher.remove();
    this.root.remove();
    this.onLaunch = null;
    this.onNext = null;
    this.onPrevious = null;
    this.onClose = null;
    this.onRestart = null;
  }
}
