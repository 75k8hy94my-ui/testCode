(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionElementPicker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createPickerState() {
    return {
      active: false,
      start() { if (this.active) return false; this.active = true; return true; },
      stop() { if (!this.active) return false; this.active = false; return true; }
    };
  }

  class ElementPicker {
    constructor(doc = document) {
      this.doc = doc;
      this.state = createPickerState();
      this.overlay = null;
      this.onSelect = null;
      this.move = this.move.bind(this);
      this.click = this.click.bind(this);
      this.key = this.key.bind(this);
    }
    start(onSelect) {
      if (!this.state.start()) return false;
      this.onSelect = onSelect;
      const overlay = this.doc.createElement('div');
      overlay.dataset.testcodeMangaPicker = 'overlay';
      Object.assign(overlay.style, { position:'fixed', pointerEvents:'none', zIndex:'2147483646', border:'2px solid #0a84ff', background:'rgba(10,132,255,.12)', borderRadius:'4px', display:'none' });
      this.doc.documentElement.appendChild(overlay); this.overlay = overlay;
      this.doc.addEventListener('mousemove', this.move, true);
      this.doc.addEventListener('click', this.click, true);
      this.doc.addEventListener('keydown', this.key, true);
      return true;
    }
    stop() {
      if (!this.state.stop()) return false;
      this.doc.removeEventListener('mousemove', this.move, true);
      this.doc.removeEventListener('click', this.click, true);
      this.doc.removeEventListener('keydown', this.key, true);
      if (this.overlay) this.overlay.remove();
      this.overlay = null; this.onSelect = null; return true;
    }
    ignore(target) { return !target || (target.closest && target.closest('[data-testcode-manga-extension-host]')); }
    move(event) {
      if (!this.state.active || this.ignore(event.target)) return;
      const rect = event.target.getBoundingClientRect();
      Object.assign(this.overlay.style, { display:'block', left:rect.left+'px', top:rect.top+'px', width:rect.width+'px', height:rect.height+'px' });
    }
    click(event) {
      if (!this.state.active || this.ignore(event.target)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const selected = event.target; const callback = this.onSelect; this.stop();
      if (callback) callback(selected);
    }
    key(event) { if (event.key === 'Escape') { event.preventDefault(); this.stop(); } }
  }

  return { createPickerState, ElementPicker };
});