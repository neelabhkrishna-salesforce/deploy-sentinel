// Encodes demo/build/frames + narration clips into an H.264/AAC MP4.
// usage: swift encode.swift <build-dir> <output.mp4>
import AVFoundation
import Foundation
import ImageIO

struct Clip: Decodable { let file: String; let start: Double }
struct Timeline: Decodable { let audio: [Clip]; let fps: Int; let total: Double }

let args = CommandLine.arguments
guard args.count == 3 else { fatalError("usage: encode.swift <build-dir> <output.mp4>") }
let buildDir = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let timeline = try JSONDecoder().decode(Timeline.self, from: Data(contentsOf: buildDir.appendingPathComponent("timeline.json")))

func wait(_ session: AVAssetExportSession) {
  let done = DispatchSemaphore(value: 0)
  session.exportAsynchronously { done.signal() }
  done.wait()
  if session.status != .completed { fatalError("export failed: \(String(describing: session.error))") }
}

// 1. Lay narration clips on one track at their scene offsets and export as AAC.
let narrationURL = buildDir.appendingPathComponent("narration.m4a")
try? FileManager.default.removeItem(at: narrationURL)
let audioComp = AVMutableComposition()
let audioTrack = audioComp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
for clip in timeline.audio {
  let asset = AVURLAsset(url: URL(fileURLWithPath: clip.file))
  guard let source = asset.tracks(withMediaType: .audio).first else { continue }
  try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: source, at: CMTime(seconds: clip.start, preferredTimescale: 600))
}
let audioExport = AVAssetExportSession(asset: audioComp, presetName: AVAssetExportPresetAppleM4A)!
audioExport.outputURL = narrationURL
audioExport.outputFileType = .m4a
wait(audioExport)

// 2. Write frames as H.264 and pass the AAC narration through.
try? FileManager.default.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let width = 1920, height = 1080
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 4_500_000,
    AVVideoMaxKeyFrameIntervalKey: timeline.fps * 4,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
  ],
])
videoInput.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
writer.add(videoInput)

let narration = AVURLAsset(url: narrationURL)
let narrationTrack = narration.tracks(withMediaType: .audio).first!
let reader = try AVAssetReader(asset: narration)
let readerOutput = AVAssetReaderTrackOutput(track: narrationTrack, outputSettings: nil)
reader.add(readerOutput)
let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: (narrationTrack.formatDescriptions.first as! CMFormatDescription))
audioInput.expectsMediaDataInRealTime = false
writer.add(audioInput)

writer.startWriting()
reader.startReading()
writer.startSession(atSourceTime: .zero)

let frames = try FileManager.default.contentsOfDirectory(atPath: buildDir.appendingPathComponent("frames").path).filter { $0.hasSuffix(".jpg") }.sorted()
let group = DispatchGroup()

group.enter()
var frameIndex = 0
videoInput.requestMediaDataWhenReady(on: DispatchQueue(label: "video")) {
  while videoInput.isReadyForMoreMediaData {
    if frameIndex >= frames.count {
      videoInput.markAsFinished()
      group.leave()
      return
    }
    autoreleasepool {
      let url = buildDir.appendingPathComponent("frames").appendingPathComponent(frames[frameIndex])
      let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
      let pixel = buffer!
      CVPixelBufferLockBaseAddress(pixel, [])
      let context = CGContext(data: CVPixelBufferGetBaseAddress(pixel), width: width, height: height, bitsPerComponent: 8,
                              bytesPerRow: CVPixelBufferGetBytesPerRow(pixel), space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      CVPixelBufferUnlockBaseAddress(pixel, [])
      adaptor.append(pixel, withPresentationTime: CMTime(value: CMTimeValue(frameIndex), timescale: CMTimeScale(timeline.fps)))
      frameIndex += 1
    }
  }
}

group.enter()
audioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
  while audioInput.isReadyForMoreMediaData {
    if let sample = readerOutput.copyNextSampleBuffer() {
      audioInput.append(sample)
    } else {
      audioInput.markAsFinished()
      group.leave()
      return
    }
  }
}

group.wait()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
if writer.status != .completed { fatalError("write failed: \(String(describing: writer.error))") }
let size = (try FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? NSNumber)?.doubleValue ?? 0
print(String(format: "wrote %@ (%.1f MB, %d frames, %.1fs)", outURL.path, size / 1_048_576, frames.count, timeline.total))
