(function (root) {
  'use strict';

  const REQUIRED_FACTORIES = [
    'mountFactory', 'stateRuntimeFactory', 'renderRuntimeFactory',
    'controllerFactory', 'bootstrapFactory', 'runtimeFactory', 'contextFactory',
  ];
  const REQUIRED_CALLBACKS = [
    'createContextDeps', 'createStateDeps', 'createRenderDeps',
    'createControllerDeps', 'createEventBindings', 'createActivation',
  ];

  function requireFactory(deps, name) {
    if (!deps[name] || typeof deps[name] !== 'object' || typeof deps[name].create !== 'function') {
      throw new TypeError('MangaListEntryFactory requires factory: ' + name);
    }
  }

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListEntryFactory requires dependency object');
    }
    for (const name of REQUIRED_FACTORIES) requireFactory(deps, name);
    for (const name of REQUIRED_CALLBACKS) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListEntryFactory requires function: ' + name);
      }
    }
    if (!deps.mountDeps || typeof deps.mountDeps !== 'object' || Array.isArray(deps.mountDeps)) {
      throw new TypeError('MangaListEntryFactory requires mountDeps object');
    }

    let started = false;
    let cleaned = false;
    let bootstrapResult = null;

    function start(input) {
      if (started || cleaned) throw new TypeError('MangaListEntryFactory instance is already used');
      if (!input || typeof input !== 'object' || Array.isArray(input) || !input.mountElement) {
        throw new TypeError('MangaListEntryFactory requires mountElement');
      }

      const mount = deps.mountFactory.create(deps.mountDeps);
      let mounted = null;
      let context = null;
      let runtime = null;
      let stateRuntime = null;
      let renderRuntime = null;
      let controller = null;

      const bootstrap = deps.bootstrapFactory.create({
        mount(mountElement) {
          mounted = mount.mount(mountElement);
          return mounted;
        },
        createController(elements) {
          context = deps.contextFactory.create(deps.createContextDeps({
            root: mounted.root,
            elements,
          }));
          runtime = deps.runtimeFactory.create(context);
          stateRuntime = deps.stateRuntimeFactory.create(deps.createStateDeps({
            root: mounted.root,
            elements,
            context,
            runtime,
          }));
          renderRuntime = deps.renderRuntimeFactory.create(deps.createRenderDeps({
            root: mounted.root,
            elements,
            context,
            runtime,
          }));
          controller = deps.controllerFactory.create(deps.createControllerDeps({
            root: mounted.root,
            elements,
            context,
            runtime,
            stateRuntime,
            renderRuntime,
          }));
          return controller;
        },
        initialize() {
          stateRuntime.initialize();
        },
        bindEvents(elements, controller) {
          return deps.createEventBindings({
            root: mounted.root,
            elements,
            context,
            runtime,
            controller,
            stateRuntime,
            renderRuntime,
          });
        },
        activate() {
          const activation = deps.createActivation({
            root: mounted.root,
            elements: mounted.elements,
            context,
            runtime,
            controller,
          });
          if (typeof activation !== 'function') {
            throw new TypeError('MangaListEntryFactory activation must return function');
          }
          activation();
        },
        render() {
          renderRuntime.render();
        },
      });

      bootstrapResult = bootstrap.bootstrap({ mountElement: input.mountElement });
      started = true;
      return Object.freeze({
        root: bootstrapResult.root,
        elements: bootstrapResult.elements,
        controller: bootstrapResult.controller,
      });
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (bootstrapResult && typeof bootstrapResult.cleanup === 'function') bootstrapResult.cleanup();
    }

    return Object.freeze({ start, cleanup });
  }

  root.MangaListEntryFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
