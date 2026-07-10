import AVFoundation
import AudioToolbox
import Foundation

final class SystemAudioCapture {
    private let sampleQueue = DispatchQueue(label: "sh.dragonfruit.copilot.system-audio")
    private var processTapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
    private var deviceProcID: AudioDeviceIOProcID?
    private var audioFile: AVAudioFile?
    private var onAudioPCMBuffer: ((AVAudioPCMBuffer) -> Void)?
    private var onError: ((Error) -> Void)?

    func start(
        recordingTo fileURL: URL? = nil,
        onAudioPCMBuffer: @escaping (AVAudioPCMBuffer) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws {
        self.onAudioPCMBuffer = onAudioPCMBuffer
        self.onError = onError

        if #available(macOS 14.2, *) {
            try startCoreAudioTap(recordingTo: fileURL)
        } else {
            throw NSError(
                domain: "DragonFruitNative",
                code: 1300,
                userInfo: [NSLocalizedDescriptionKey: "System Audio Recording Only requires macOS 14.2 or later."]
            )
        }
    }

    func requestPermission() async throws {
        try await start(recordingTo: nil, onAudioPCMBuffer: { _ in }, onError: { _ in })
        try? await Task.sleep(nanoseconds: 350_000_000)
        await stop()
    }

    func stop() async {
        let activeAggregateDeviceID = aggregateDeviceID
        let activeDeviceProcID = deviceProcID
        let activeProcessTapID = processTapID
        aggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
        deviceProcID = nil
        processTapID = AudioObjectID(kAudioObjectUnknown)
        audioFile = nil
        onAudioPCMBuffer = nil
        onError = nil

        guard activeAggregateDeviceID.isValidAudioObject else {
            if #available(macOS 14.2, *), activeProcessTapID.isValidAudioObject {
                AudioHardwareDestroyProcessTap(activeProcessTapID)
            }
            return
        }

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            sampleQueue.async { [activeAggregateDeviceID, activeDeviceProcID, activeProcessTapID] in
                if let activeDeviceProcID {
                    AudioDeviceStop(activeAggregateDeviceID, activeDeviceProcID)
                    AudioDeviceDestroyIOProcID(activeAggregateDeviceID, activeDeviceProcID)
                }
                AudioHardwareDestroyAggregateDevice(activeAggregateDeviceID)
                if #available(macOS 14.2, *), activeProcessTapID.isValidAudioObject {
                    AudioHardwareDestroyProcessTap(activeProcessTapID)
                }
                continuation.resume()
            }
        }
    }

    @available(macOS 14.2, *)
    private func startCoreAudioTap(recordingTo fileURL: URL?) throws {
        try stopExistingCaptureSynchronously()

        let currentProcessObjectID = try? AudioObjectID.translateCurrentProcessObjectID()
        let excludedProcesses = currentProcessObjectID.map { [$0] } ?? []
        let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: excludedProcesses)
        tapDescription.uuid = UUID()
        tapDescription.name = "DragonFruit Atlas System Audio"
        tapDescription.isPrivate = true
        tapDescription.muteBehavior = .unmuted

        var newProcessTapID = AudioObjectID(kAudioObjectUnknown)
        var status = AudioHardwareCreateProcessTap(tapDescription, &newProcessTapID)
        guard status == noErr else {
            throw Self.makeAudioError(
                code: status,
                message: "System audio recording could not start. Allow Atlas under System Audio Recording Only."
            )
        }
        processTapID = newProcessTapID

        var streamDescription = try newProcessTapID.readAudioTapStreamBasicDescription()
        guard let audioFormat = AVAudioFormat(streamDescription: &streamDescription) else {
            throw Self.makeAudioError(code: -1, message: "System audio format is unavailable.")
        }

        if let fileURL {
            try? FileManager.default.removeItem(at: fileURL)
            audioFile = try AVAudioFile(
                forWriting: fileURL,
                settings: audioFormat.settings,
                commonFormat: audioFormat.commonFormat,
                interleaved: audioFormat.isInterleaved
            )
        }

        let systemOutputID = try AudioObjectID.readDefaultSystemOutputDevice()
        let outputUID = try systemOutputID.readDeviceUID()
        let aggregateDescription: [String: Any] = [
            kAudioAggregateDeviceNameKey: "DragonFruit Atlas System Audio",
            kAudioAggregateDeviceUIDKey: "sh.dragonfruit.copilot.system-audio.\(UUID().uuidString)",
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceSubDeviceListKey: [
                [
                    kAudioSubDeviceUIDKey: outputUID,
                ],
            ],
            kAudioAggregateDeviceTapListKey: [
                [
                    kAudioSubTapUIDKey: tapDescription.uuid.uuidString,
                    kAudioSubTapDriftCompensationKey: true,
                ],
            ],
        ]

        var newAggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
        status = AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &newAggregateDeviceID)
        guard status == noErr else {
            throw Self.makeAudioError(code: status, message: "System audio device could not be created.")
        }
        aggregateDeviceID = newAggregateDeviceID

        let callback: AudioDeviceIOBlock = { [weak self] _, inputData, _, _, _ in
            guard let self else { return }
            // The HAL owns `inputData` only for the duration of this IO cycle,
            // but consumers hold the buffer past it — speech recognition
            // queues it and converts asynchronously on its own thread. A
            // no-copy wrapper here caused use-after-free crashes inside
            // SFSpeechAudioBufferRecognitionRequest when the device recycled
            // or tore down its buffers (EXC_BAD_ACCESS in
            // CrashIfClientProvidedBogusAudioBufferList). Deep-copy into
            // memory the AVAudioPCMBuffer owns.
            guard let wrapper = AVAudioPCMBuffer(pcmFormat: audioFormat, bufferListNoCopy: inputData, deallocator: nil),
                  let buffer = Self.ownedCopy(of: wrapper, format: audioFormat)
            else {
                self.onError?(Self.makeAudioError(code: -1, message: "System audio buffer is unavailable."))
                return
            }
            do {
                try self.audioFile?.write(from: buffer)
            } catch {
                self.onError?(error)
            }
            self.onAudioPCMBuffer?(buffer)
        }

        var newDeviceProcID: AudioDeviceIOProcID?
        status = AudioDeviceCreateIOProcIDWithBlock(&newDeviceProcID, newAggregateDeviceID, sampleQueue, callback)
        guard status == noErr else {
            throw Self.makeAudioError(code: status, message: "System audio recorder is unavailable.")
        }
        deviceProcID = newDeviceProcID

        status = AudioDeviceStart(newAggregateDeviceID, newDeviceProcID)
        guard status == noErr else {
            throw Self.makeAudioError(
                code: status,
                message: "System audio recording could not start. Allow Atlas under System Audio Recording Only."
            )
        }

        UserDefaults.standard.set(true, forKey: "df_system_audio_permission_granted")
    }

    @available(macOS 14.2, *)
    private func stopExistingCaptureSynchronously() throws {
        guard aggregateDeviceID.isValidAudioObject else {
            if processTapID.isValidAudioObject {
                AudioHardwareDestroyProcessTap(processTapID)
                processTapID = AudioObjectID(kAudioObjectUnknown)
            }
            return
        }

        let activeAggregateDeviceID = aggregateDeviceID
        let activeDeviceProcID = deviceProcID
        let activeProcessTapID = processTapID
        aggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
        deviceProcID = nil
        processTapID = AudioObjectID(kAudioObjectUnknown)
        audioFile = nil

        if let activeDeviceProcID {
            AudioDeviceStop(activeAggregateDeviceID, activeDeviceProcID)
            AudioDeviceDestroyIOProcID(activeAggregateDeviceID, activeDeviceProcID)
        }
        AudioHardwareDestroyAggregateDevice(activeAggregateDeviceID)
        if activeProcessTapID.isValidAudioObject {
            AudioHardwareDestroyProcessTap(activeProcessTapID)
        }
    }

    /// Copies a HAL-backed (no-copy) buffer into a self-owned AVAudioPCMBuffer
    /// that stays valid after the IO cycle returns.
    private static func ownedCopy(of source: AVAudioPCMBuffer, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: max(source.frameLength, 1)) else {
            return nil
        }
        copy.frameLength = source.frameLength
        let sourceBuffers = UnsafeMutableAudioBufferListPointer(
            UnsafeMutablePointer(mutating: source.audioBufferList)
        )
        let copyBuffers = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        for (index, sourceBuffer) in sourceBuffers.enumerated() where index < copyBuffers.count {
            guard let sourceData = sourceBuffer.mData, let copyData = copyBuffers[index].mData else { continue }
            let byteCount = min(Int(sourceBuffer.mDataByteSize), Int(copyBuffers[index].mDataByteSize))
            memcpy(copyData, sourceData, byteCount)
        }
        return copy
    }

    private static func makeAudioError(code: OSStatus, message: String) -> NSError {
        NSError(
            domain: "DragonFruitNative",
            code: Int(code),
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

extension AudioObjectID {
    static var systemObject: AudioObjectID {
        AudioObjectID(kAudioObjectSystemObject)
    }

    var isValidAudioObject: Bool {
        self != AudioObjectID(kAudioObjectUnknown)
    }

    static func readDefaultSystemOutputDevice() throws -> AudioDeviceID {
        try systemObject.readAudioObjectProperty(
            kAudioHardwarePropertyDefaultSystemOutputDevice,
            defaultValue: AudioDeviceID(kAudioObjectUnknown)
        )
    }

    static func translateCurrentProcessObjectID() throws -> AudioObjectID {
        try systemObject.readAudioObjectProperty(
            kAudioHardwarePropertyTranslatePIDToProcessObject,
            defaultValue: AudioObjectID(kAudioObjectUnknown),
            qualifier: getpid()
        )
    }

    func readDeviceUID() throws -> String {
        try readAudioObjectProperty(kAudioDevicePropertyDeviceUID, defaultValue: "" as CFString) as String
    }

    func readAudioTapStreamBasicDescription() throws -> AudioStreamBasicDescription {
        try readAudioObjectProperty(kAudioTapPropertyFormat, defaultValue: AudioStreamBasicDescription())
    }

    private func readAudioObjectProperty<T>(
        _ selector: AudioObjectPropertySelector,
        defaultValue: T
    ) throws -> T {
        try readAudioObjectProperty(
            AudioObjectPropertyAddress(
                mSelector: selector,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            ),
            defaultValue: defaultValue,
            qualifierSize: 0,
            qualifierData: nil
        )
    }

    private func readAudioObjectProperty<T, Q>(
        _ selector: AudioObjectPropertySelector,
        defaultValue: T,
        qualifier: Q
    ) throws -> T {
        var mutableQualifier = qualifier
        return try withUnsafeMutablePointer(to: &mutableQualifier) { pointer in
            try readAudioObjectProperty(
                AudioObjectPropertyAddress(
                    mSelector: selector,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain
                ),
                defaultValue: defaultValue,
                qualifierSize: UInt32(MemoryLayout<Q>.size(ofValue: qualifier)),
                qualifierData: pointer
            )
        }
    }

    private func readAudioObjectProperty<T>(
        _ address: AudioObjectPropertyAddress,
        defaultValue: T,
        qualifierSize: UInt32,
        qualifierData: UnsafeRawPointer?
    ) throws -> T {
        var mutableAddress = address
        var dataSize: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(self, &mutableAddress, qualifierSize, qualifierData, &dataSize)
        guard status == noErr else {
            throw NSError(
                domain: "DragonFruitNative",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Could not read system audio property."]
            )
        }

        var value = defaultValue
        status = withUnsafeMutablePointer(to: &value) { pointer in
            AudioObjectGetPropertyData(self, &mutableAddress, qualifierSize, qualifierData, &dataSize, pointer)
        }
        guard status == noErr else {
            throw NSError(
                domain: "DragonFruitNative",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Could not read system audio property."]
            )
        }
        return value
    }
}
