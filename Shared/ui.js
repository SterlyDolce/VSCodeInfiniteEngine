import '../node_modules/ionicons/dist/ionicons/ionicons.esm.js';

/* global document, Node, Element, Document, MutationObserver */
// Infinite Engine shared UI primitives.
// All factories return real DOM elements. They do not depend on engine logic.

function append(parent, element) {
  parent?.appendChild(element);
  return element;
}
function addChildren(element, children = []) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) addChildren(element, child);
    else if (child instanceof Node || typeof child === 'string' || typeof child === 'number') element.append(child);
    else throw new TypeError('UI children must be DOM nodes, strings, or numbers');
  }
  return element;
}
function listen(element, eventType, event) {
  if (typeof event === 'function') element.addEventListener(eventType, event);
  return element;
}
function decorate(element, { id, className = '', title, ariaLabel } = {}) {
  if (id != null) element.id = id;
  if (className) element.classList.add(...className.trim().split(/\s+/));
  if (title != null) element.title = title;
  if (ariaLabel != null) element.setAttribute('aria-label', ariaLabel);
  return element;
}

export function text(parent = null, { text: content = '', variant = 'default', ...extra } = {}) {
  const element = document.createElement('span');
  element.className = `ie-text ie-text-${variant}`;
  element.textContent = String(content);
  decorate(element, extra);
  return append(parent, element);
}

export function button(parent = null, {
  children = [text(null, { text: 'Click me' })],
  variant = 'default', disabled = false, eventType = 'click', event = () => {},
  type = 'button', ...extra
} = {}) {
  const element = document.createElement('button');
  element.type = type;
  element.className = `ie-button ie-button-${variant}`;
  element.disabled = disabled;
  decorate(element, extra);
  addChildren(element, children);
  listen(element, eventType, event);
  return append(parent, element);
}

export function input(parent = null, {
  type = 'text', value = '', placeholder = '', disabled = false,
  eventType = 'change', event = () => {}, min, max, step, ...extra
} = {}) {
  const element = document.createElement('input');
  element.type = type;
  element.className = 'ie-input';
  element.disabled = disabled;
  element.placeholder = placeholder;
  if (type === 'checkbox') element.checked = Boolean(value);
  else element.value = String(value ?? '');
  if (min != null) element.min = String(min);
  if (max != null) element.max = String(max);
  if (step != null) element.step = String(step);
  decorate(element, extra);
  listen(element, eventType, event);
  return append(parent, element);
}

export function select(parent = null, {
  options = [], value, disabled = false, eventType = 'change', event = () => {}, ...extra
} = {}) {
  const element = document.createElement('select');
  element.className = 'ie-select';
  element.disabled = disabled;
  for (const option of options) {
    const data = (option && typeof option === 'object') ? option : { value: option, label: option };
    const item = document.createElement('option');
    item.value = String(data.value);
    item.textContent = String(data.label ?? data.value);
    item.disabled = Boolean(data.disabled);
    element.appendChild(item);
  }
  if (value != null) element.value = String(value);
  decorate(element, extra);
  listen(element, eventType, event);
  return append(parent, element);
}

export function checkbox(parent = null, { checked = false, event = () => {}, ...extra } = {}) {
  return input(parent, { type: 'checkbox', value: checked, eventType: 'change', event, ...extra });
}

export function panel(parent = null, { children = [], variant = 'default', ...extra } = {}) {
  const element = document.createElement('div');
  element.className = `ie-panel ie-panel-${variant}`;
  decorate(element, extra);
  addChildren(element, children);
  return append(parent, element);
}

export function section(parent = null, { title = '', children = [], ...extra } = {}) {
  const element = document.createElement('section');
  element.className = 'ie-section';
  decorate(element, extra);
  const heading = document.createElement('div');
  heading.className = 'ie-section-title';
  if (title instanceof Node) heading.append(title);
  else heading.textContent = String(title);
  element.append(heading);
  addChildren(element, children);
  return append(parent, element);
}

export function propertyRow(parent = null, { label = '', children = [], ...extra } = {}) {
  const element = document.createElement('div');
  element.className = 'ie-property-row';
  decorate(element, extra);
  const caption = document.createElement('span');
  caption.className = 'ie-property-label';
  caption.textContent = String(label);
  const content = document.createElement('div');
  content.className = 'ie-property-control';
  addChildren(content, children);
  element.append(caption, content);
  return append(parent, element);
}

export function toolbar(parent = null, { children = [], ...extra } = {}) {
  const element = document.createElement('div');
  element.className = 'ie-toolbar';
  decorate(element, extra);
  addChildren(element, children);
  return append(parent, element);
}

export function vector(parent = null, { values = [0, 0, 0], labels = ['X','Y','Z','W'], event = () => {}, ...extra } = {}) {
  const element = document.createElement('div');
  element.className = `ie-vector ie-vector-${values.length}`;
  decorate(element, extra);
  values.forEach((value, index) => {
    const control = input(element, {
      type: 'number', value, step: 'any',
      className: `ie-axis-${String(labels[index] ?? index).toLowerCase()}`,
      ariaLabel: String(labels[index] ?? index),
      event: (e) => event(index, e.target.valueAsNumber, e)
    });
    control.dataset.axis = String(index);
  });
  return append(parent, element);
}

function decorateControls(root) {
  if (!(root instanceof Element || root instanceof Document)) return;
  const elements = root instanceof Element
    ? [root, ...root.querySelectorAll('button, input, select, textarea')]
    : [...root.querySelectorAll('button, input, select, textarea')];
  for (const element of elements) {
    if (element.matches('button')) element.classList.add('ie-button');
    else if (element.matches('input, textarea')) element.classList.add('ie-input');
    else if (element.matches('select')) element.classList.add('ie-select');
  }
}

/** Apply the shared UI treatment to static and dynamically-created controls. */
export function initialize(root = document) {
  decorateControls(root);
  if (root !== document || document.documentElement.dataset.ieUiReady) return;
  document.documentElement.dataset.ieUiReady = 'true';
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) decorateControls(node);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
} else {
  initialize();
}
