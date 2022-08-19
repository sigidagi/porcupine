/*
  Copyright 2022 Picovoice Inc.

  You may not use this file except in compliance with the license. A copy of the license is located in the "LICENSE"
  file accompanying this source.

  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
  an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
  specific language governing permissions and limitations under the License.
*/

import {
  fromBase64,
  fromPublicDirectory,
} from '@picovoice/web-utils';

import PvWorker from 'web-worker:./porcupine_worker_handler.ts';

import { keywordsProcess } from './utils';

import {
  PorcupineDetection,
  PorcupineKeyword,
  PorcupineOptions,
  PorcupineWorkerInitResponse,
  PorcupineWorkerProcessResponse,
  PorcupineWorkerReleaseResponse,
} from './types';
import { BuiltInKeyword } from './built_in_keywords';

export class PorcupineWorker {
  private readonly _worker: Worker;
  private readonly _version: string;
  private readonly _frameLength: number;
  private readonly _sampleRate: number;

  private static _wasm: string;
  private static _wasmSimd: string;

  private constructor(worker: Worker, version: string, frameLength: number, sampleRate: number) {
    this._worker = worker;
    this._version = version;
    this._frameLength = frameLength;
    this._sampleRate = sampleRate;
  }

  /**
   * Get Porcupine engine version.
   */
  get version(): string {
    return this._version;
  }

  /**
   * Get Porcupine frame length.
   */
  get frameLength(): number {
    return this._frameLength;
  }

  /**
   * Get sample rate.
   */
  get sampleRate(): number {
    return this._sampleRate;
  }

  /**
   * Get Porcupine worker instance.
   */
  get worker(): Worker {
    return this._worker;
  }

  /**
   * Creates an instance of the Porcupine wake word engine using a base64'd string
   * of the model file. The model size is large, hence it will try to use the
   * existing one if it exists, otherwise saves the model in storage.
   *
   * @param accessKey AccessKey generated by Picovoice Console.
   * @param keywords - Built-in or Base64
   * representations of keywords and their sensitivities.
   * Can be provided as an array or a single keyword.
   * @param keywordDetectionCallback - User-defined callback invoked upon detection of the wake phrase.
   * The only input argument is the index of detected keyword (phrase).
   * @param modelBase64 The model in base64 string to initialize Porcupine.
   * @param options Optional configuration arguments.
   * @param options.processErrorCallback User-defined callback invoked if any error happens
   * while processing the audio stream. Its only input argument is the error message.
   * @param options.customWritePath Custom path to save the model in storage.
   * Set to a different name to use multiple models across `porcupine` instances.
   * @param options.forceWrite Flag to overwrite the model in storage even if it exists.
   * @param options.version Porcupine model version. Set to a higher number to update the model file.
   * @returns An instance of the Porcupine engine.
   */

  public static async fromBase64(
    accessKey: string,
    keywords: Array<PorcupineKeyword | BuiltInKeyword> | PorcupineKeyword | BuiltInKeyword,
    keywordDetectionCallback: (porcupineDetection: PorcupineDetection) => void,
    modelBase64: string,
    options: PorcupineOptions = {},
  ): Promise<PorcupineWorker> {
    const {
      customWritePath = 'porcupine_model',
      forceWrite = false,
      version = 1,
      ...rest
    } = options;
    await fromBase64(customWritePath, modelBase64, forceWrite, version);
    const [keywordPaths, sensitivities] = await keywordsProcess(keywords);
    return this.create(
      accessKey,
      keywordPaths,
      sensitivities,
      keywordDetectionCallback,
      customWritePath,
      rest);
  }

  /**
   * Creates a worker instance of the Porcupine engine using '.pv' file in
   * public directory. The model size is large, hence it will try to use the existing one if it exists,
   * otherwise saves the model in storage.
   *
   * @param accessKey AccessKey generated by Picovoice Console.
   * @param keywords - Built-in or Base64
   * representations of keywords and their sensitivities.
   * Can be provided as an array or a single keyword.
   * @param keywordDetectionCallback - User-defined callback invoked upon detection of the wake phrase.
   * The only input argument is the index of detected keyword (phrase).
   * @param publicPath The model path relative to the public directory.
   * @param options Optional configuration arguments.
   * @param options.processErrorCallback User-defined callback invoked if any error happens
   * while processing the audio stream. Its only input argument is the error message.
   * @param options.customWritePath Custom path to save the model in storage.
   * Set to a different name to use multiple models across `Porcupine` instances.
   * @param options.forceWrite Flag to overwrite the model in storage even if it exists.
   * @param options.version Porcupine model version. Set to a higher number to update the model file.
   *
   * @returns An instance of PorcupineWorker.
   */
  public static async fromPublicDirectory(
    accessKey: string,
    keywords: Array<PorcupineKeyword | BuiltInKeyword> | PorcupineKeyword | BuiltInKeyword,
    keywordDetectionCallback: (porcupineDetection: PorcupineDetection) => void,
    publicPath: string,
    options: PorcupineOptions = {},
  ): Promise<PorcupineWorker> {
    const {
      customWritePath = 'porcupine_model',
      forceWrite = false,
      version = 1,
      ...rest
    } = options;
    await fromPublicDirectory(customWritePath, publicPath, forceWrite, version);
    const [keywordPaths, sensitivities] = await keywordsProcess(keywords);
    return this.create(
      accessKey,
      keywordPaths,
      sensitivities,
      keywordDetectionCallback,
      customWritePath,
      rest);
  }

  /**
   * Set base64 wasm file.
   * @param wasm Base64'd wasm file to use to initialize wasm.
   */
  public static setWasm(wasm: string): void {
    if (this._wasm === undefined) {
      this._wasm = wasm;
    }
  }

  /**
   * Set base64 wasm file with SIMD feature.
   * @param wasmSimd Base64'd wasm file to use to initialize wasm.
   */
  public static setWasmSimd(wasmSimd: string): void {
    if (this._wasmSimd === undefined) {
      this._wasmSimd = wasmSimd;
    }
  }

  /**
   * Creates a worker instance of the Picovoice Porcupine engine.
   * Behind the scenes, it requires the WebAssembly code to load and initialize before
   * it can create an instance.
   *
   * @param accessKey AccessKey obtained from Picovoice Console (https://console.picovoice.ai/)
   * @param keywordPaths - The path to the keyword file saved in indexedDB.
   * @param sensitivities - Sensitivity of the keywords.
   * @param keywordDetectionCallback - User-defined callback invoked upon detection of the wake phrase.
   * The only input argument is the index of detected keyword (phrase).
   * @param modelPath Path to the model saved in indexedDB.
   * Can be provided as an array or a single keyword.
   * @param options Optional configuration arguments.
   * while processing the audio stream. Its only input argument is the error message.
   *
   * @returns An instance of PorcupineWorker.
   */
  private static async create(
    accessKey: string,
    keywordPaths: Array<string>,
    sensitivities: Float32Array,
    keywordDetectionCallback: (porcupineDetection: PorcupineDetection) => void,
    modelPath: string,
    options: PorcupineOptions = {},
  ): Promise<PorcupineWorker> {
    const { processErrorCallback } = options;

    const worker = new PvWorker();
    const returnPromise: Promise<PorcupineWorker> = new Promise((resolve, reject) => {
      // @ts-ignore - block from GC
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<PorcupineWorkerInitResponse>): void => {
        switch (event.data.command) {
          case 'ok':
            worker.onmessage = (ev: MessageEvent<PorcupineWorkerProcessResponse>): void => {
              switch (ev.data.command) {
                case 'ok':
                  keywordDetectionCallback(ev.data.porcupineDetection);
                  break;
                case 'failed':
                case 'error':
                  if (processErrorCallback) {
                    processErrorCallback(ev.data.message);
                  } else {
                    // eslint-disable-next-line no-console
                    console.error(ev.data.message);
                  }
                  break;
                default:
                  // @ts-ignore
                  processErrorCallback(`Unrecognized command: ${event.data.command}`);
              }
            };
            resolve(new PorcupineWorker(worker, event.data.version, event.data.frameLength, event.data.sampleRate));
            break;
          case 'failed':
          case 'error':
            reject(event.data.message);
            break;
          default:
            // @ts-ignore
            reject(`Unrecognized command: ${event.data.command}`);
        }
      };
    });

    worker.postMessage({
      command: 'init',
      accessKey: accessKey,
      modelPath: modelPath,
      keywords: keywordPaths,
      sensitivities: sensitivities,
      wasm: this._wasm,
      wasmSimd: this._wasmSimd,
      options: options,
    });

    return returnPromise;
  }

  /**
   * Processes a frame of audio in a worker.
   * The transcript result will be supplied with the callback provided when initializing the worker either
   * by 'fromBase64' or 'fromPublicDirectory'.
   * Can also send a message directly using 'this.worker.postMessage({command: "process", pcm: [...]})'.
   *
   * @param pcm A frame of audio sample.
   */
  public process(pcm: Int16Array): void {
    this._worker.postMessage({
      command: 'process',
      inputFrame: pcm,
    });
  }

  /**
   * Releases resources acquired by WebAssembly module.
   */
  public release(): Promise<void> {
    const returnPromise: Promise<void> = new Promise((resolve, reject) => {
      this._worker.onmessage = (event: MessageEvent<PorcupineWorkerReleaseResponse>): void => {
        switch (event.data.command) {
          case 'ok':
            resolve();
            break;
          case 'failed':
          case 'error':
            reject(event.data.message);
            break;
          default:
            // @ts-ignore
            reject(`Unrecognized command: ${event.data.command}`);
        }
      };
    });

    this._worker.postMessage({
      command: 'release',
    });

    return returnPromise;
  }

  /**
   * Terminates the active worker. Stops all requests being handled by worker.
   */
  public terminate(): void {
    this._worker.terminate();
  }
}