(function (root) {
  'use strict';

  const REQUIRED = [
    'cleanup', 'setTitle', 'setEditing', 'getMount', 'createLoading',
    'fetchReader', 'parseHtml', 'installHeadAssets', 'mountBody',
    'loadMediaGate', 'getScripts', 'loadScript', 'getGeneration',
    'ensureVideoEntryEnhancement', 'prune', 'activate', 'sync', 'renderError'
  ];

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('ReaderRouteRuntimeFactory requires dependency object');
    }
    for (const name of REQUIRED) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('ReaderRouteRuntimeFactory requires function: ' + name);
      }
    }

    async function render(route, generation) {
      const target = deps.getMount();
      if (!target) return;
      if (generation !== deps.getGeneration()) return;
      deps.cleanup();
      deps.setTitle(route);
      deps.setEditing(false);
      target.replaceChildren();
      target.append(deps.createLoading());
      try {
        const response = await deps.fetchReader();
        if (!response.ok) throw new Error('reader load failed');
        const doc = deps.parseHtml(await response.text());
        if (generation !== deps.getGeneration()) return;
        deps.installHeadAssets(doc);
        deps.mountBody(doc);
        await deps.loadMediaGate();
        if (generation !== deps.getGeneration()) return;
        for (const source of deps.getScripts(doc)) {
          await deps.loadScript(source);
          if (generation !== deps.getGeneration()) return;
        }
        if (route === 'video') await deps.ensureVideoEntryEnhancement();
        if (generation !== deps.getGeneration()) return;
        deps.prune(route);
        if (route === 'manga' || route === 'video') deps.activate(route);
        deps.sync();
      } catch (error) {
        if (generation === deps.getGeneration()) deps.renderError(target, error);
      }
    }

    return Object.freeze({ render });
  }

  root.ReaderRouteRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
