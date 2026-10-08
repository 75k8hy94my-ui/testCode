import test from 'node:test';
import assert from 'node:assert/strict';
import processor from '../image-photo-processor.js';

function fakePhoto({ width = 6000, height = 4000, type = 'image/jpeg', size = 900000 } = {}) {
  return { name: 'photo.jpg', type, size, width, height };
}

function createFakeRuntime({ width = 6000, height = 4000, delay = 0 } = {}) {
  const encoded = [];
  const drawCalls = [];
  const runtime = {
    async decode(file) {
      return {
        source: { width, height }, width, height,
        close() {}
      };
    },
    createCanvas(canvasWidth, canvasHeight) {
      return { width: canvasWidth, height: canvasHeight, getContext() { return { drawImage() {} }; } };
    },
    async encode(canvas, mimeType, quality) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const blob = new Blob([new Uint8Array(Math.max(1, Math.round(canvas.width * canvas.height * (1 - quality) / 100)))], { type: mimeType });
      encoded.push({ width: canvas.width, height: canvas.height, quality, blob });
      return blob;
    },
    drawImage(source, canvas, options = {}) {
      drawCalls.push({ source, targetWidth: canvas.width, targetHeight: canvas.height, ...options });
    },
    releaseCanvas() {},
    encoded,
    drawCalls
  };
  return runtime;
}

test('processor API is exposed', () => {
  assert.equal(typeof processor.processPhoto, 'function');
});

test('preview and level resize use the full source while tiles use an explicit source rectangle', async () => {
  const runtime = createFakeRuntime();
  await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime });

  const fullSourceResizes = runtime.drawCalls.filter(call => call.sourceWidth == null && call.sourceHeight == null);
  assert.ok(fullSourceResizes.some(call => call.targetWidth === 1440 && call.targetHeight === 960));
  assert.ok(fullSourceResizes.some(call => call.targetWidth === 2048 && call.targetHeight === 1365));
  assert.ok(fullSourceResizes.some(call => call.targetWidth === 4096 && call.targetHeight === 2731));

  const tileCrops = runtime.drawCalls.filter(call => call.sourceWidth != null || call.sourceHeight != null);
  assert.ok(tileCrops.length > 0);
  assert.ok(tileCrops.every(call => call.sourceX != null && call.sourceY != null && call.sourceWidth != null && call.sourceHeight != null));
});

test('default runtime emits full-source and crop drawImage signatures', () => {
  const calls = [];
  const source = { width: 6000, height: 4000 };
  const canvas = { getContext() { return { drawImage: (...args) => calls.push(args) }; } };
  const runtime = processor.createDefaultRuntime();

  runtime.drawImage(source, canvas, { width: 1440, height: 960 });
  runtime.drawImage(source, canvas, { width: 512, height: 512, sourceX: 512, sourceY: 0, sourceWidth: 512, sourceHeight: 512 });
  assert.deepEqual(calls[0], [source, 0, 0, 1440, 960]);
  assert.deepEqual(calls[1], [source, 512, 0, 512, 512, 0, 0, 512, 512]);
});

test('processor returns independent preview and tile blobs with manifest metadata', async () => {
  const result = await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime: createFakeRuntime() });
  assert.ok(result.previewBlob instanceof Blob);
  assert.ok(Array.isArray(result.tileBlobs));
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.compressionProfileVersion, 1);
  assert.deepEqual(result.manifest.source, { width: 6000, height: 4000, mimeType: 'image/jpeg', bytes: 900000 });
  assert.equal(result.manifest.preview.mimeType, 'image/webp');
  assert.equal(result.manifest.preview.longEdge, 1440);
  assert.equal(result.manifest.preview.quality, 0.64);
  assert.deepEqual(result.manifest.zoom.levels.map(level => level.longEdge), [2048, 4096]);
  assert.equal(result.tileBlobs.length, result.manifest.zoom.levels.reduce((sum, level) => sum + level.tiles.length, 0));
  assert.equal(result.manifest.zoom.levels[0].tiles[0].quality, 0.88);
});

test('preview candidates use adaptive quality and fallback dimensions in order', async () => {
  const runtime = createFakeRuntime();
  await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime, previewTargetBytes: 1 });
  assert.deepEqual(runtime.encoded.slice(0, 4).map(item => [item.width, item.height, item.quality]), [
    [1440, 960, 0.64],
    [1440, 960, 0.60],
    [1440, 960, 0.56],
    [1280, 853, 0.56]
  ]);
});

test('progress reports required phases and completes after all binaries are made', async () => {
  const updates = [];
  const result = await processor.processPhoto(fakePhoto({ width: 1900, height: 1200 }), {
    preferWorker: false,
    runtime: createFakeRuntime({ width: 1900, height: 1200 }),
    onProgress: update => updates.push(update)
  });
  assert.deepEqual([...new Set(updates.map(update => update.phase))], ['decode', 'preview', 'pyramid', 'tiles', 'complete']);
  assert.equal(updates.at(-1).phase, 'complete');
  assert.equal(result.manifest.zoom.levels.length, 1);
});

test('abort is reported as AbortError and never returns partial output', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => processor.processPhoto(fakePhoto(), { signal: controller.signal, preferWorker: false, runtime: createFakeRuntime() }),
    error => error.name === 'AbortError'
  );
});

test('abort during work stops before completing the result', async () => {
  const controller = new AbortController();
  const runtime = createFakeRuntime({ delay: 2 });
  await assert.rejects(
    () => processor.processPhoto(fakePhoto(), {
      signal: controller.signal,
      preferWorker: false,
      runtime,
      onProgress: update => { if (update.phase === 'tiles' && update.completed > 0) controller.abort(); }
    }),
    error => error.name === 'AbortError'
  );
});


test('Safari-style Canvas WebP fallback is re-encoded as JPEG and never stored as mislabeled PNG', async () => {
  const runtime=createFakeRuntime({width:6000,height:4000});
  const encoded=[];
  runtime.encode=async(canvas,mimeType,quality)=>{
    const actual=mimeType==='image/webp' ? 'image/png' : mimeType;
    const size=actual==='image/png' ? 2000000 : 25000;
    const blob=new Blob([new Uint8Array(size)],{type:actual});
    encoded.push({requested:mimeType,actual,size,quality});
    return blob;
  };
  const original=await import('../image-compression-profile.js');
  const profile=original.default.getCompressionProfile();
  profile.zoom.intermediateLongEdge=3072;
  profile.zoom.maximumLongEdge=3072;
  profile.zoom.tileSize=1024;
  profile.zoom.quality=0.76;
  const result=await processor.processPhoto(fakePhoto(),{
    preferWorker:false,runtime,profile
  });
  assert.ok(encoded.some(x=>x.requested==='image/webp'&&x.actual==='image/png'));
  assert.ok(encoded.some(x=>x.requested==='image/jpeg'&&x.actual==='image/jpeg'));
  assert.equal(result.previewBlob.type,'image/jpeg');
  assert.equal(result.manifest.preview.mimeType,'image/jpeg');
  assert.equal(result.manifest.zoom.levels.length,1);
  assert.ok(result.tileBlobs.length>0);
  assert.ok(result.tileBlobs.every(blob=>blob.type==='image/jpeg'));
  assert.ok(result.manifest.zoom.levels.every(level=>level.tiles.every(tile=>tile.mimeType==='image/jpeg')));
  assert.equal(result.tileBlobs.reduce((sum,b)=>sum+b.size,0),result.tileBlobs.length*25000);
});

test('unsupported browser encoder fails rather than publishing incorrect MIME metadata', async () => {
  const runtime=createFakeRuntime({width:1600,height:1000});
  runtime.encode=async()=>new Blob([new Uint8Array(5)],{type:'image/png'});
  await assert.rejects(processor.processPhoto(fakePhoto(),{preferWorker:false,runtime}),/JPEG画像の書き出し/);
});


test('actual encoded image keeps all source detail when shorter than chosen single-level cap', async () => {
  const profiles = await import('../image-compression-profile.js');
  const profile = profiles.default.getCompressionProfile();
  profile.zoom.intermediateLongEdge = 3072;
  profile.zoom.maximumLongEdge = 3072;
  profile.zoom.quality = 0.76;
  profile.zoom.tileSize = 1024;
  const small = await processor.processPhoto(fakePhoto({width:2500,height:1500}), {
    preferWorker:false, profile, runtime:createFakeRuntime({width:2500,height:1500})
  });
  assert.deepEqual(small.manifest.zoom.levels.map(level=>level.longEdge),[2500]);
  assert.equal(small.manifest.zoom.levels[0].width,2500);
  assert.equal(small.manifest.zoom.levels[0].height,1500);
  const large = await processor.processPhoto(fakePhoto({width:6000,height:3600}), {
    preferWorker:false, profile, runtime:createFakeRuntime({width:6000,height:3600})
  });
  assert.deepEqual(large.manifest.zoom.levels.map(level=>level.longEdge),[3072]);
  const tiny = await processor.processPhoto(fakePhoto({width:1200,height:800}), {
    preferWorker:false, profile, runtime:createFakeRuntime({width:1200,height:800})
  });
  assert.deepEqual(tiny.manifest.zoom.levels,[]);
  assert.equal(tiny.manifest.preview.longEdge,1200);
});


test('photo optimizer reduces measured encoded size without upscaling or inventing duplicate zoom levels', async () => {
  const profileModule = await import('../image-compression-profile.js');
  const profile = profileModule.default.getCompressionProfile();
  profile.zoom.intermediateLongEdge = 3072;
  profile.zoom.maximumLongEdge = 3072;
  profile.zoom.tileSize = 1024;
  profile.zoom.quality = 0.86;
  const runtime=createFakeRuntime({width:5000,height:3000});
  const calls=[];
  runtime.encode=async (canvas,mimeType,quality)=>{
    calls.push({width:canvas.width,height:canvas.height,quality});
    const size = Math.max(1, Math.floor(canvas.width*canvas.height*(0.28+quality*0.85)));
    return new Blob([new Uint8Array(size)],{type:mimeType});
  };
  const updates=[];
  const optimizer={
    bytesPerMegapixel:440*1024,maxZoomBytes:3*1024*1024,minZoomBytes:550*1024,
    minQuality:0.66,minZoomLongEdge:1700,maxPasses:5
  };
  const result=await processor.processPhoto(fakePhoto({width:5000,height:3000}),{
    preferWorker:false,profile,photoOptimization:optimizer,runtime,
    onProgress:x=>updates.push(x)
  });
  assert.equal(result.manifest.zoom.levels.length,1);
  assert.equal(result.manifest.zoom.levels[0].tiles.length,result.tileBlobs.length);
  assert.ok(result.manifest.zoom.levels[0].longEdge<=3072);
  assert.ok(result.manifest.zoom.levels[0].longEdge>=1700);
  assert.ok(updates.filter(x=>x.phase==='optimizing').length>1,'photograph exceeds initial target and must be re-encoded');
  const zoomBytes=result.tileBlobs.reduce((sum,b)=>sum+b.size,0);
  assert.equal(zoomBytes,result.manifest.zoom.levels[0].tiles.reduce((sum,t)=>sum+t.bytes,0));
  assert.equal(result.manifest.source.bytes,900000);
  assert.ok(result.manifest.zoom.levels[0].tiles.every(t=>t.quality>=0.66));
  assert.ok(result.tileBlobs.every(b=>b.type==='image/webp'));
  assert.equal(updates.at(-1).phase,'complete');
});

test('adaptive optimization keeps native resolution when already within image-size budget', async () => {
  const profileModule=await import('../image-compression-profile.js');
  const profile=profileModule.default.getCompressionProfile();
  profile.zoom.maximumLongEdge=3072;
  profile.zoom.intermediateLongEdge=3072;
  profile.zoom.tileSize=1024;
  profile.zoom.quality=0.86;
  const runtime=createFakeRuntime({width:2400,height:1600});
  const events=[];
  const result=await processor.processPhoto(fakePhoto({width:2400,height:1600}),{
    preferWorker:false,profile,runtime,
    photoOptimization:{
      bytesPerMegapixel:440*1024,maxZoomBytes:3*1024*1024,minZoomBytes:550*1024,
      minQuality:0.66,minZoomLongEdge:1700,maxPasses:5
    },
    onProgress:e=>events.push(e)
  });
  assert.equal(result.manifest.zoom.levels[0].longEdge,2400);
  assert.equal(result.manifest.zoom.levels[0].tiles[0].quality,0.86);
  assert.equal(events.filter(e=>e.phase==='optimizing').length,1);
});

test('photo optimizer respects cancellation during its re-encode attempts', async () => {
  const profileModule=await import('../image-compression-profile.js');
  const profile=profileModule.default.getCompressionProfile();
  profile.zoom.maximumLongEdge=3072;profile.zoom.intermediateLongEdge=3072;
  profile.zoom.tileSize=1024;profile.zoom.quality=0.86;
  const runtime=createFakeRuntime({width:5000,height:3000});
  runtime.encode=async(c,type,quality)=>new Blob([new Uint8Array(Math.round(c.width*c.height*1.2))],{type});
  const controller=new AbortController();
  await assert.rejects(processor.processPhoto(fakePhoto(),{
    preferWorker:false,runtime,profile,signal:controller.signal,
    photoOptimization:{
      bytesPerMegapixel:440*1024,maxZoomBytes:3*1024*1024,minZoomBytes:550*1024,
      minQuality:0.66,minZoomLongEdge:1700,maxPasses:5
    },
    onProgress:e=>{if(e.phase==='optimizing')controller.abort()}
  }),error=>error.name==='AbortError');
});

test('photo optimization settings reject invalid sizes and unbounded retries', async () => {
  const runtime=createFakeRuntime();
  await assert.rejects(processor.processPhoto(fakePhoto(),{
    preferWorker:false,runtime,photoOptimization:{maxPasses:100}
  }),/settings are invalid/);
});
