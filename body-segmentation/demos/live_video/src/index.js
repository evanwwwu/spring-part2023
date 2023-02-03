/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

// ?model=selfie_segmentation
// ?model=mediapipe_hands
// 
import '@tensorflow/tfjs-backend-webgl';

import * as mpPose from '@mediapipe/pose';
import * as mpSelfieSegmentation from '@mediapipe/selfie_segmentation';
import * as tfjsWasm from '@tensorflow/tfjs-backend-wasm';
import * as tf from '@tensorflow/tfjs-core';

tfjsWasm.setWasmPaths(
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${
        tfjsWasm.version_wasm}/dist/`);

import * as bodySegmentation from '@tensorflow-models/body-segmentation';

import {
  Camera
} from './camera';
import {
  setupDatGui
} from './option_panel';
import {
  STATE
} from './shared/params';
import {
  setupStats
} from './shared/stats_panel';
import {
  setBackendAndEnvFlags
} from './shared/util';

let segmenter, camera, stats;
let cameras;
let fpsDisplayMode = 'model';
const resetTime = {
  startInferenceTime: 0,
  numInferences: 0,
  inferenceTimeSum: 0,
  lastPanelUpdate: 0
};
let modelTime = {
  ...resetTime
};
let E2ETime = {
  ...resetTime
};
let rafId;
const MODEL_LABEL = '(Model FPS';
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

async function createSegmenter() {

  const runtime = STATE.backend.split('-')[0];
  if (runtime === 'mediapipe') {
    return bodySegmentation.createSegmenter(STATE.model, {
      runtime,
      modelType: STATE.modelConfig.type,
      solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${
                  mpSelfieSegmentation.VERSION}`
    });
  } else if (runtime === 'tfjs') {
    return bodySegmentation.createSegmenter(STATE.model, {
      runtime,
      modelType: STATE.modelConfig.type,
    });

  }
}

async function checkGuiUpdate() {
  if (STATE.isCameraChanged) {
    camera = await Camera.setupCamera(STATE.camera, cameras);
    canvas.width = camera.canvas.width;
    canvas.height = camera.canvas.height;
    STATE.isCameraChanged = false;
  }

  if (STATE.isModelChanged || STATE.isFlagChanged || STATE.isBackendChanged ||
    STATE.isVisChanged) {
    STATE.isModelChanged = true;

    window.cancelAnimationFrame(rafId);

    if (segmenter != null) {
      segmenter.dispose();
    }

    if (STATE.isFlagChanged || STATE.isBackendChanged) {
      await setBackendAndEnvFlags(STATE.flags, STATE.backend);
    }

    try {
      segmenter = await createSegmenter();
    } catch (error) {
      segmenter = null;
      alert(error);
    }

    STATE.isFlagChanged = false;
    STATE.isBackendChanged = false;
    STATE.isModelChanged = false;
    STATE.isVisChanged = false;
  }
}

function beginEstimateSegmentationStats(time) {
  time.startInferenceTime = (performance || Date).now();
}

function endEstimateSegmentationStats(time) {
  const endInferenceTime = (performance || Date).now();
  time.inferenceTimeSum += endInferenceTime - time.startInferenceTime;
  ++time.numInferences;

  const panelUpdateMilliseconds = 1000;
  if (endInferenceTime - time.lastPanelUpdate >= panelUpdateMilliseconds) {
    const averageInferenceTime = time.inferenceTimeSum / time.numInferences;
    time.inferenceTimeSum = 0;
    time.numInferences = 0;
    stats.customFpsPanel.update(
      1000.0 / averageInferenceTime, 120 /* maxValue */ );
    time.lastPanelUpdate = endInferenceTime;
  }
}

async function renderResult() {
  if (camera.video.readyState < 2) {
    await new Promise((resolve) => {
      camera.video.onloadeddata = () => {
        resolve(video);
      };
    });
  }

  let segmentation = null;

  // Segmenter can be null if initialization failed (for example when loading
  // from a URL that does not exist).
  if (segmenter != null) {
    // Change in what FPS should measure.
    const newFpsDisplayMode = 'model';
    if (fpsDisplayMode != newFpsDisplayMode) {
      if (newFpsDisplayMode === 'model') {
        stats = setupStats(MODEL_LABEL);
        modelTime = {
          ...resetTime
        };
      } else {
        stats = setupStats(E2E_LABEL);
        E2ETime = {
          ...resetTime
        };
      }
      fpsDisplayMode = newFpsDisplayMode;
    }
    // Model FPS only counts the time it takes to finish segmentPeople.
    if (fpsDisplayMode === 'model') {
      beginEstimateSegmentationStats(modelTime);
    } else { // E2E FPS includes rendering time.
      beginEstimateSegmentationStats(E2ETime);
    }

    // Detectors can throw errors, for example when using custom URLs that
    // contain a model that doesn't provide the expected output.
    try {
      if (segmenter.segmentPeople != null) {
        segmentation = await segmenter.segmentPeople(camera.video, {
          flipHorizontal: false,
          multiSegmentation: false,
          segmentBodyParts: false,
          segmentationThreshold: STATE.visualization.foregroundThreshold
        });
      } else {
        segmentation = await segmenter.estimatePoses(
          camera.video, {
            flipHorizontal: false
          });
        segmentation = segmentation.map(
          singleSegmentation => singleSegmentation.segmentation);
      }
    } catch (error) {
      segmenter.dispose();
      segmenter = null;
      alert(error);
    }

    if (fpsDisplayMode === 'model') {
      // Ensure GPU is done for timing purposes.
      const [backend] = STATE.backend.split('-');
      if (backend === 'tfjs') {
        for (const value of segmentation) {
          const mask = value.mask;
          const tensor = await mask.toTensor();

          const res = tensor.dataToGPU();

          const webGLBackend = tf.backend();
          const buffer =
            webGLBackend.gpgpu.createBufferFromTexture(res.texture, 1, 1);
          webGLBackend.gpgpu.downloadFloat32MatrixFromBuffer(buffer, 1);

          res.tensorRef.dispose();
        }
      } else if (backend === 'mediapipe') {
        // Code in
        // node_modules/@mediapipe/selfie_segmentation/selfie_segmentation.js
        // must be modified to expose the webgl context it uses.
        const gl = window.exposedContext;
        if (gl)
          gl.readPixels(
            0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }

      endEstimateSegmentationStats(modelTime);
    }
  }

  // The null check makes sure the UI is not in the middle of changing to a
  // different model. If during model change, the result is from an old model,
  // which shouldn't be rendered.
  if (segmentation && segmentation.length > 0 && !STATE.isModelChanged) {
    const vis = STATE.modelConfig.visualization;
    const options = STATE.visualization;
    if (vis === 'binaryMask') {
      const data = await bodySegmentation.toBinaryMask(
        segmentation, {
          r: 255,
          g: 0,
          b: 0,
          a: 255
        }, {
          r: 0,
          g: 0,
          b: 0,
          a: 0
        },
        false, options.foregroundThreshold);
      await bodySegmentation.drawMask(
        canvas, camera.video, data, options.maskOpacity, options.maskBlur);
    } else if (vis === 'coloredMask') {
      const data = await bodySegmentation.toColoredMask(
        segmentation, bodySegmentation.bodyPixMaskValueToRainbowColor, {
          r: 0,
          g: 0,
          b: 0,
          a: 255
        }, options.foregroundThreshold);
      await bodySegmentation.drawMask(
        canvas, camera.video, data, options.maskOpacity, options.maskBlur);
    } else if (vis === 'pixelatedMask') {
      const data = await bodySegmentation.toColoredMask(
        segmentation, bodySegmentation.bodyPixMaskValueToRainbowColor, {
          r: 0,
          g: 0,
          b: 0,
          a: 255
        }, options.foregroundThreshold);
      await bodySegmentation.drawPixelatedMask(
        canvas, camera.video, data, options.maskOpacity, options.maskBlur,
        false, options.pixelCellWidth);
    } else if (vis === 'bokehEffect') {
      await bodySegmentation.drawBokehEffect(
        canvas, camera.video, segmentation, options.foregroundThreshold,
        options.backgroundBlur, options.edgeBlur);
    } else if (vis === 'blurFace') {
      await bodySegmentation.blurBodyPart(
        canvas, camera.video, segmentation, [0, 1],
        options.foregroundThreshold, options.backgroundBlur,
        options.edgeBlur);
    } else {
      camera.drawFromVideo(ctx);
    }
  }
  camera.drawToCanvas(canvas);

  if (fpsDisplayMode === 'e2e') {
    endEstimateSegmentationStats(E2ETime);
  }
}

async function renderPrediction() {
  await checkGuiUpdate();

  if (!STATE.isModelChanged) {
    await renderResult();
  }

  rafId = requestAnimationFrame(renderPrediction);
}

async function getVideoInputs() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log('enumerateDevices() not supported.');
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  const videoDevices = devices.filter(device => device.kind === 'videoinput');

  return videoDevices;
}

async function app() {
  // Gui content will change depending on which model is in the query string.
  // const urlParams = new URLSearchParams("selfie_segmentation");
  // if (!urlParams.has('model')) {
  //   alert('Cannot find model in the query string.');
  //   return;
  // }

  cameras = await getVideoInputs();

  await setupDatGui(cameras);

  stats = setupStats(MODEL_LABEL);

  camera = await Camera.setupCamera(STATE.camera, cameras);
  canvas.width = camera.canvas.width;
  canvas.height = camera.canvas.height;

  await setBackendAndEnvFlags(STATE.flags, STATE.backend);

  segmenter = await createSegmenter();

  renderPrediction();

};

function matrix() {
  // geting canvas by Boujjou Achraf
  var c = document.getElementById("c");
  var ctx = c.getContext("2d");

  //making the canvas full screen
  c.height = window.innerHeight;
  c.width = window.innerWidth;

  //chinese characters - taken from the unicode charset
  var matrix = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
  //converting the string into an array of single characters
  matrix = matrix.split("");

  var font_size = 10;
  var columns = c.width / font_size; //number of columns for the rain
  //an array of drops - one per column
  var drops = [];
  //x below is the x coordinate
  //1 = y co-ordinate of the drop(same for every drop initially)
  for (var x = 0; x < columns; x++)
    drops[x] = 1;

  //drawing the characters
  function draw() {
    //Black BG for the canvas
    //translucent BG to show trail
    ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#76ff12"; //green text
    ctx.font = font_size + "px arial";
    //looping over drops
    for (var i = 0; i < drops.length; i++) {
      //a random chinese character to print
      var text = matrix[Math.floor(Math.random() * matrix.length)];
      //x = i*font_size, y = value of drops[i]*font_size
      ctx.fillText(text, i * font_size, drops[i] * font_size);

      //sending the drop back to the top randomly after it has crossed the screen
      //adding a randomness to the reset to make the drops scattered on the Y axis
      if (drops[i] * font_size > c.height && Math.random() > 0.975)
        drops[i] = 0;

      //incrementing Y coordinate
      drops[i]++;
    }
  }

  setInterval(draw, 35);

}
app();
matrix()