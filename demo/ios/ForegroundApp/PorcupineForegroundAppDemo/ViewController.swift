//
//  Copyright 2018-2023 Picovoice Inc.
//  You may not use this file except in compliance with the license. A copy of the license is located in the "LICENSE"
//  file accompanying this source.
//  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
//  an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
//  specific language governing permissions and limitations under the License.
//

import UIKit
import ios_voice_processor
import Porcupine

class ViewController: UIViewController, UIPickerViewDelegate, UIPickerViewDataSource {
    @IBOutlet weak var wakeWordPicker: UIPickerView!
    @IBOutlet weak var startButton: UIButton!
    @IBOutlet weak var errorPanel: UITextView!

    let accessKey = "${YOUR_ACCESS_KEY_HERE}" // Obtained from Picovoice Console (https://console.picovoice.ai)

    let language: String = ProcessInfo.processInfo.environment["LANGUAGE"]!

    var wakeWordKeys = [String]()
    var wakeWord = ""

    var porcupineManager: PorcupineManager!
    var isListening = false

    override func viewDidLoad() {
        super.viewDidLoad()

        if language == "en" {
            for w in Porcupine.BuiltInKeyword.allCases {
                wakeWordKeys.append(w.rawValue)
            }
        } else {
            let bundle = Bundle(for: type(of: self))
            let keywordUrls: [URL] = bundle.urls(forResourcesWithExtension: "ppn", subdirectory: "keywords")!
            for k in keywordUrls {
                let keyword = k.lastPathComponent
                    .replacingOccurrences(of: "_ios.ppn", with: "")
                    .replacingOccurrences(of: "_", with: " ")
                wakeWordKeys.append(keyword)
            }
        }
        wakeWord = wakeWordKeys[0]

        wakeWordPicker.delegate = self
        wakeWordPicker.dataSource = self

        let viewSize = view.frame.size
        let startButtonSize = CGSize(width: 120, height: 120)
        let errorLabelSize = CGSize(width: (viewSize.width - 40), height: 120)

        startButton.frame.size = startButtonSize
        startButton.frame.origin =
            CGPoint(x: (viewSize.width - startButtonSize.width) / 2, y: viewSize.height - (startButtonSize.height + 40))
        startButton.layer.cornerRadius = 0.5 * startButton.bounds.size.width
        startButton.clipsToBounds = true

        wakeWordPicker.frame.origin = CGPoint(x: 0, y: 0)
        wakeWordPicker.frame.size = CGSize(
            width: viewSize.width,
            height: viewSize.height - (startButtonSize.height + errorLabelSize.height + 40)
        )

        errorPanel.layer.cornerRadius = 10
        errorPanel.frame.origin = CGPoint(
            x: ((viewSize.width - errorLabelSize.width) / 2),
            y: viewSize.height - (startButtonSize.height + errorLabelSize.height + 60)
        )
        errorPanel.frame.size = errorLabelSize
        errorPanel.isHidden = true
    }

    func numberOfComponents(in pickerView: UIPickerView) -> Int {
        return 1
    }

    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
        return wakeWordKeys.count
    }

    func pickerView(_ pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? {
        return wakeWordKeys[row]
    }

    func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
        wakeWord = wakeWordKeys[row]
    }

    func showErrorAlert(_ message: String) {
        errorPanel.text = message
        errorPanel.isHidden = false
        wakeWordPicker.isUserInteractionEnabled = false
        startButton.isEnabled = false
    }

    @IBAction func toggleStartButton(_ sender: UIButton) {
        if !isListening {
            startListening()
        } else {
            stopListening()
        }
    }

    func startListening() {
        guard VoiceProcessor.hasRecordAudioPermission else {
            VoiceProcessor.requestRecordAudioPermission { isGranted in
                guard isGranted else {
                    DispatchQueue.main.async {
                        self.showErrorAlert("Demo requires microphone permission")
                    }
                    return
                }

                DispatchQueue.main.async {
                    self.startListening()
                }
            }
            return
        }

        let originalColor = self.view.backgroundColor
        let keywordCallback: ((Int32) -> Void) = { _ in
            self.view.backgroundColor = UIColor.orange
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                self.view.backgroundColor = originalColor
            }
        }

        let errorCallback: ((Error) -> Void) = {error in
            self.showErrorAlert("\(error)")
        }

        do {
            if language == "en" {
                porcupineManager = try PorcupineManager(
                    accessKey: accessKey,
                    keyword: Porcupine.BuiltInKeyword.init(rawValue: wakeWord)!,
                    onDetection: keywordCallback,
                    errorCallback: errorCallback)
            } else {
                let bundle = Bundle(for: type(of: self))
                let keywordUrl: URL = bundle.url(
                    forResource: "\(wakeWord.lowercased())_ios",
                    withExtension: "ppn",
                    subdirectory: "keywords")!
                let modelUrl: URL = bundle.url(
                    forResource: "porcupine_params_\(language)",
                    withExtension: "pv",
                    subdirectory: "models")!
                porcupineManager = try PorcupineManager(
                    accessKey: accessKey,
                    keywordPath: keywordUrl.path,
                    modelPath: modelUrl.path,
                    onDetection: keywordCallback,
                    errorCallback: errorCallback)
            }

            try porcupineManager.start()

            wakeWordPicker.isUserInteractionEnabled = false
            isListening = true
            startButton.setTitle("STOP", for: UIControl.State.normal)
        } catch let error as PorcupineInvalidArgumentError {
            showErrorAlert("\(error.localizedDescription)\nEnsure your accessKey '\(accessKey)' is valid")
        } catch is PorcupineActivationError {
            showErrorAlert("AccessKey activation error")
        } catch is PorcupineActivationRefusedError {
            showErrorAlert("AccessKey activation refused")
        } catch is PorcupineActivationLimitError {
            showErrorAlert("AccessKey reached its limit")
        } catch is PorcupineActivationThrottledError {
            showErrorAlert("AccessKey is throttled")
        } catch {
            showErrorAlert("\(error)")
        }
    }

    func stopListening() {
        do {
            try porcupineManager.stop()
        } catch {
            showErrorAlert("\(error)")
            return
        }
        wakeWordPicker.isUserInteractionEnabled = true
        isListening = false
        startButton.setTitle("START", for: UIControl.State.normal)
    }
}
