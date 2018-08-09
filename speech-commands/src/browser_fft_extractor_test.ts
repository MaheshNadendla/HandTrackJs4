/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs';
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';

// tslint:disable-next-line:max-line-length
import {BrowserFftFeatureExtractor, getFrequencyDataFromRotatingBuffer, getInputTensorFromFrequencyData} from './browser_fft_extractor';
import * as BrowserFftUtils from './browser_fft_utils';
import {FakeAudioContext, FakeAudioMediaStream} from './browser_test_utils';

const testEnvs = tf.test_util.NODE_ENVS;

describeWithFlags('getFrequencyDataFromRotatingBuffer', testEnvs, () => {
  it('getFrequencyDataFromRotatingBuffer', () => {
    const rotBuffer = new Float32Array([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    const numFrames = 3;
    const fftLength = 2;
    expect(
        getFrequencyDataFromRotatingBuffer(rotBuffer, numFrames, fftLength, 0))
        .toEqual(new Float32Array([1, 1, 2, 2, 3, 3]));

    expect(
        getFrequencyDataFromRotatingBuffer(rotBuffer, numFrames, fftLength, 1))
        .toEqual(new Float32Array([2, 2, 3, 3, 4, 4]));
    expect(
        getFrequencyDataFromRotatingBuffer(rotBuffer, numFrames, fftLength, 3))
        .toEqual(new Float32Array([4, 4, 5, 5, 6, 6]));
    expect(
        getFrequencyDataFromRotatingBuffer(rotBuffer, numFrames, fftLength, 4))
        .toEqual(new Float32Array([5, 5, 6, 6, 1, 1]));
    expect(
        getFrequencyDataFromRotatingBuffer(rotBuffer, numFrames, fftLength, 6))
        .toEqual(new Float32Array([1, 1, 2, 2, 3, 3]));
  });
});

describeWithFlags('getInputTensorFromFrequencyData', testEnvs, () => {
  it('Unnormalized', () => {
    const freqData = new Float32Array([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    const numFrames = 6;
    const fftSize = 2;
    const tensor =
        getInputTensorFromFrequencyData(freqData, numFrames, fftSize, false);
    tf.test_util.expectArraysClose(tensor, tf.tensor4d(freqData, [1, 6, 2, 1]));
  });

  it('Normalized', () => {
    const freqData = new Float32Array([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    const numFrames = 6;
    const fftSize = 2;
    const tensor =
        getInputTensorFromFrequencyData(freqData, numFrames, fftSize);
    tf.test_util.expectArraysClose(
        tensor,
        tf.tensor4d(
            [
              -1.4638501, -1.4638501, -0.8783101, -0.8783101, -0.29277,
              -0.29277, 0.29277, 0.29277, 0.8783101, 0.8783101, 1.4638501,
              1.4638501
            ],
            [1, 6, 2, 1]));
  });
});

describeWithFlags('BrowserFftFeatureExtractor', testEnvs, () => {
  function setUpFakes() {
    spyOn(BrowserFftUtils, 'getAudioContextConstructor')
        .and.callFake(() => FakeAudioContext.createInstance);
    spyOn(BrowserFftUtils, 'getAudioMediaStream')
        .and.callFake(() => new FakeAudioMediaStream());
  }

  it('constructor', () => {
    setUpFakes();

    const extractor = new BrowserFftFeatureExtractor({
      spectrogramCallback: (x: tf.Tensor) => false,
      numFramesPerSpectrogram: 43,
      columnTruncateLength: 225,
    });

    expect(extractor.fftSize).toEqual(1024);
    expect(extractor.numFramesPerSpectrogram).toEqual(43);
    expect(extractor.columnTruncateLength).toEqual(225);
    expect(extractor.overlapFactor).toBeCloseTo(0.5);
  });

  it('constructor errors due to null config', () => {
    expect(() => new BrowserFftFeatureExtractor(null))
        .toThrowError(/Required configuration object is missing/);
  });

  it('constructor errors due to missing spectrogramCallback', () => {
    expect(() => new BrowserFftFeatureExtractor({
             spectrogramCallback: null,
             numFramesPerSpectrogram: 43,
             columnTruncateLength: 225,
           }))
        .toThrowError(/spectrogramCallback cannot be null or undefined/);
  });

  it('constructor errors due to invalid numFramesPerSpectrogram', () => {
    expect(() => new BrowserFftFeatureExtractor({
             spectrogramCallback: (x: tf.Tensor) => false,
             numFramesPerSpectrogram: -2,
             columnTruncateLength: 225,
           }))
        .toThrowError(/Invalid value in numFramesPerSpectrogram: -2/);
  });

  it('constructor errors due to nengative overlapFactor', () => {
    expect(
        () => new BrowserFftFeatureExtractor({
          spectrogramCallback: (x: tf.Tensor) => false,
          numFramesPerSpectrogram: 43,
          columnTruncateLength: 225,
          columnBufferLength: 1024,
          columnHopLength: -512  // Leads to negative overlapFactor and Error.
        }))
        .toThrowError(/Invalid overlapFactor/);
  });

  it('constructor errors due to columnTruncateLength too large', () => {
    expect(() => new BrowserFftFeatureExtractor({
             spectrogramCallback: (x: tf.Tensor) => false,
             numFramesPerSpectrogram: 43,
             columnTruncateLength: 1600,  // > 1024 and leads to Error.
             columnBufferLength: 1024
           }))
        .toThrowError(/columnTruncateLength .* exceeds fftSize/);
  });

  it('start and stop: overlapFactor = 0', async done => {
    setUpFakes();

    const numTensors0 = tf.memory().numTensors;
    const callbackTimestamps: number[] = [];
    const spectrogramTensors: tf.Tensor[] = [];
    const extractor = new BrowserFftFeatureExtractor({
      spectrogramCallback: (x: tf.Tensor) => {
        callbackTimestamps.push(tf.util.now());
        spectrogramTensors.push(tf.clone(x));
        return false;
      },
      numFramesPerSpectrogram: 43,
      columnTruncateLength: 225,
      columnBufferLength: 1024,
      columnHopLength: 1024  // Full hop, no overlap.
    });

    const spectrogramDurationMillis = 1024 / 44100 * 43 * 1e3;
    await extractor.start();

    setTimeout(async () => {
      await extractor.stop();

      expect(callbackTimestamps.length).toEqual(3);
      expect(callbackTimestamps[1] - callbackTimestamps[0])
          .toBeGreaterThan(spectrogramDurationMillis);
      expect(callbackTimestamps.length).toEqual(3);
      expect(callbackTimestamps[2] - callbackTimestamps[1])
          .toBeGreaterThan(spectrogramDurationMillis);

      tf.tidy(() => {
        expect(spectrogramTensors.length).toEqual(3);
        for (let i = 0; i < 3; ++i) {
          expect(spectrogramTensors[i].shape).toEqual([1, 43, 225, 1]);
          // Check the spectrogram is normalized.
          tf.test_util.expectArraysClose(
              spectrogramTensors[i],
              BrowserFftUtils.normalize(spectrogramTensors[i]));
        }
      });

      // Assert no memory leak. The 3 extra ones are due to clone
      // in the custom callback.
      tf.dispose(spectrogramTensors);
      expect(tf.memory().numTensors).toEqual(numTensors0);
      done();
    }, spectrogramDurationMillis * 3.5);
  });

  it('start and stop: overlapFactor = 0.5', async done => {
    setUpFakes();

    const spectrogramTensors: tf.Tensor[] = [];
    const callbackTimestamps: number[] = [];
    const extractor = new BrowserFftFeatureExtractor({
      spectrogramCallback: (x: tf.Tensor) => {
        callbackTimestamps.push(tf.util.now());
        spectrogramTensors.push(tf.clone(x));
        return false;
      },
      numFramesPerSpectrogram: 43,
      columnTruncateLength: 225,
      columnBufferLength: 1024,
      columnHopLength: 512  // 50% overlapFactor.
    });

    const spectrogramDurationMillis = 1024 / 44100 * 43 * 1e3;
    await extractor.start();

    setTimeout(async () => {
      await extractor.stop();

      expect(callbackTimestamps.length).toEqual(6);
      expect(callbackTimestamps[1] - callbackTimestamps[0])
          .toBeGreaterThan(spectrogramDurationMillis * 0.5);
      expect(callbackTimestamps.length).toEqual(6);
      expect(callbackTimestamps[2] - callbackTimestamps[1])
          .toBeGreaterThan(spectrogramDurationMillis * 0.5);

      expect(spectrogramTensors.length).toEqual(6);
      for (let i = 0; i < 6; ++i) {
        expect(spectrogramTensors[i].shape).toEqual([1, 43, 225, 1]);
        // Check the spectrogram is normalized.
        tf.test_util.expectArraysClose(
            spectrogramTensors[i],
            BrowserFftUtils.normalize(spectrogramTensors[i]));
      }
      done();
    }, spectrogramDurationMillis * 3.5);
  });

  it('stopping unstarted extractor leads to Error', async () => {
    setUpFakes();

    const extractor = new BrowserFftFeatureExtractor({
      spectrogramCallback: (x: tf.Tensor) => false,
      numFramesPerSpectrogram: 43,
      columnTruncateLength: 225,
      columnBufferLength: 1024,
      columnHopLength: 1024,
    });

    let caughtError: Error;
    try {
      await extractor.stop();
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError.message)
        .toMatch(/Cannot stop because there is no ongoing streaming activity/);
  });
});
