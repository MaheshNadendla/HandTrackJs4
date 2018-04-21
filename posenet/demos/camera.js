/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licnses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as tf from '@tensorflow/tfjs-core';
import dat from 'dat.gui';
import * as posenet from '../src';

import {drawKeypoints, drawSkeleton, renderToCanvas} from './demo_util';
const maxStride = 32;
const videoSizes = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(
  (multiplier) => (maxStride * multiplier + 1));
const maxVideoSize = 513;
const canvasSize = 400;

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(({kind}) => kind === 'videoinput');
}

let currentStream = null;

function stopCurrentVideoStream() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => {
      track.stop();
    });
  }
}

function loadVideo(cameraId) {
  return new Promise((resolve, reject) => {
    stopCurrentVideoStream();

    const video = document.getElementById('video');

    video.width = maxVideoSize;
    video.height = maxVideoSize;

    if (navigator.getUserMedia) {
      navigator.getUserMedia({
        video: {
          width: maxVideoSize,
          height: maxVideoSize,
          deviceId: {exact: cameraId},
        },
      }, handleVideo, videoError);
    }

    function handleVideo(stream) {
      currentStream = stream;
      video.srcObject = stream;

      resolve(video);
    }

    function videoError(e) {
      // do something
      reject(e);
    }
  });
}

const guiState = {
  outputStride: 16,
  minPartConfidence: 0.2,
  minPoseConfidence: 0.4,
  inputImageResolution: 225,
  maxPoseDetections: 2,
  nmsRadius: 10,
  showVideo: true,
  showSkeleton: true,
  showPoints: true
};

function setupGui(cameras) {
  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const cameraOptions = cameras.reduce((result, {label, deviceId}) => {
    result[label] = deviceId;
    return result;
  }, {});

  const gui = new dat.GUI();

  gui.add(guiState, 'camera', cameraOptions).onChange((deviceId) => {
    loadVideo(deviceId);
  });
  gui.add(guiState, 'outputStride', [8, 16, 32]);
  gui.add(guiState, 'minPartConfidence', 0.0, 1.0);
  gui.add(guiState, 'minPoseConfidence', 0.0, 1.0);
  gui.add(guiState, 'maxPoseDetections').min(1).max(20).step(1);
  gui.add(guiState, 'nmsRadius').min(0.0).max(40.0);
  gui.add(guiState, 'inputImageResolution', videoSizes);
  gui.add(guiState, 'showVideo');
  gui.add(guiState, 'showSkeleton');
  gui.add(guiState, 'showPoints');
}

function detectPoseInRealTime(video, model) {
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  async function poseDetectionFrame() {
    const inputImageResolution = Number(guiState.inputImageResolution);
    const outputStride = Number(guiState.outputStride);
    const minConfidence = Number(guiState.minPartConfidence);

    ctx.clearRect(0, 0,canvasSize, canvasSize);

    const originalImage = tf.fromPixels(video);
    const image = originalImage.reverse(1).resizeBilinear(
      [inputImageResolution, inputImageResolution]);

    const scale = canvasSize / inputImageResolution;
    const poses = await model.estimateMultiplePoses(
      image, outputStride, guiState.maxPoseDetections,
      guiState.minPartConfidence, guiState.nmsRadius);

    if (guiState.showVideo) {
      ctx.save();
      ctx.scale(-1,1);
      ctx.drawImage(video,0,0,canvasSize*-1,canvasSize);
      ctx.restore();
    }

    poses.forEach(({score, keypoints}) => {
      if (score >= guiState.minPoseConfidence) {
        if (guiState.showPoints) {
          drawKeypoints(keypoints, minConfidence, ctx, scale);
        }
        if (guiState.showSkeleton) {
          drawSkeleton(keypoints, minConfidence, ctx, scale);
        }
      }
    });

    image.dispose();
    originalImage.dispose();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

export async function bindPage() {
  const model = new posenet.PoseNet();

  await model.load();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'block';

  const cameras = await getCameras();

  if (cameras.length === 0) {
    alert('No webcams available.  Reload the page when a webcam is available.');
    return;
  }

  const video = await loadVideo(cameras[0].deviceId);

  setupGui(cameras);
  detectPoseInRealTime(video, model);
}

navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia;
bindPage();
