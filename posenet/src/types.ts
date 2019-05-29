/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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

export type Vector2D = {
  y: number,
  x: number
};

export type Part = {
  heatmapX: number,
  heatmapY: number,
  id: number
};

export type PartWithScore = {
  score: number,
  part: Part
};

export type Keypoint = {
  score: number,
  position: Vector2D,
  part: string
};

export type Pose = {
  keypoints: Keypoint[],
  score: number,
};

export type PosenetInput =
    ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement|tf.Tensor3D;

export type TensorBuffer3D = tf.TensorBuffer<tf.Rank.R3>;

export type MobileNetMultiplier = 0.25|0.50|0.75|1.0|1.01;
export type OutputStride = 32|16|8;
