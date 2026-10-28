// 产品图抠图：用 macOS Vision 的 Foreground Instance Mask 提取主体，输出透明背景 PNG
//
// 用法：
//   cutout <输入图> <输出png> [--pad N] [--max N] [--square]
//
// 参数：
//   --pad N     主体四周留白，按主体长边的 N% 计（默认 4）
//   --max N     输出长边像素上限（默认 1200）
//   --square    输出正方形画布（主体居中），否则按主体外接框裁切
//
// 输出 JSON 行到 stdout，便于批量脚本解析：
//   {"ok":true,"inW":..,"inH":..,"outW":..,"outH":..,"cover":0.62,"instances":1}

import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import AppKit

func fail(_ msg: String, _ code: Int32 = 1) -> Never {
    let obj: [String: Any] = ["ok": false, "error": msg]
    if let d = try? JSONSerialization.data(withJSONObject: obj),
       let s = String(data: d, encoding: .utf8) { print(s) }
    exit(code)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("用法: cutout <in> <out> [--pad N] [--max N] [--square]") }
let inPath = args[1]
let outPath = args[2]

var padPct = 4.0
var maxSide = 1200.0
var wantSquare = false
var i = 3
while i < args.count {
    switch args[i] {
    case "--pad": i += 1; padPct = Double(args[i]) ?? 4.0
    case "--max": i += 1; maxSide = Double(args[i]) ?? 1200
    case "--square": wantSquare = true
    default: break
    }
    i += 1
}

guard let nsImage = NSImage(contentsOfFile: inPath),
      let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fail("读图失败或格式不支持")
}
let inW = cgImage.width, inH = cgImage.height
if inW < 40 || inH < 40 { fail("图太小 \(inW)x\(inH)") }

// ---- 1. 主体提取 ----
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fail("Vision 执行失败: \(error.localizedDescription)")
}
guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
    fail("未检测到主体（可能是纯色/线稿/图表）")
}

// ---- 2. 合并全部 instance 的蒙版并裁出主体 ----
let ciContext = CIContext(options: [.useSoftwareRenderer: false])
let ciInput = CIImage(cgImage: cgImage)
var masked: CIImage
do {
    // cropped(to:) 让 mask 输出与输入图同尺寸，避免多 instance 合并时尺寸不一致
    let maskBuffer = try observation.generateScaledMaskForImage(
        forInstances: observation.allInstances, from: handler)
    let maskCI = CIImage(cvPixelBuffer: maskBuffer).cropped(to: ciInput.extent)
    let blend = CIFilter.blendWithMask()
    blend.inputImage = ciInput
    blend.backgroundImage = CIImage(color: .clear).cropped(to: ciInput.extent)
    blend.maskImage = maskCI
    guard let out = blend.outputImage else { fail("蒙版合成失败") }
    masked = out
} catch {
    fail("生成蒙版失败: \(error.localizedDescription)")
}

// ---- 3. 用 alpha 通道求主体外接框 ----
guard let cgMasked = ciContext.createCGImage(masked, from: ciInput.extent) else {
    fail("渲染失败")
}
guard let alphaData = alphaBounds(cgMasked) else { fail("主体为空（全透明）") }
// ★ alphaBounds 读的是 CGImage 像素坐标（左上原点，y 向下）；
// CIImage.cropped(to:) 用左下原点（y 向上）。必须翻转 Y，否则裁切位置垂直偏移。
var box = alphaData.box
let cgImageHeight = CGFloat(cgMasked.height)
box.origin.y = cgImageHeight - (box.origin.y + box.height)
let cover = Double(alphaData.pixels) / Double(inW * inH)

// 主体过小说明抠错了（常见于把水印/角标当主体）
if cover < 0.004 { fail("主体占比过小 \(String(format: "%.3f", cover))") }

// ---- 4. 按需裁切 / 加留白 / 缩放到上限 ----
let pad = max(box.width, box.height) * padPct / 100.0
box = CGRect(x: box.minX - pad, y: box.minY - pad,
             width: box.width + pad * 2, height: box.height + pad * 2)

var canvasRect: CGRect
if wantSquare {
    let side = max(box.width, box.height)
    let cx = box.midX, cy = box.midY
    canvasRect = CGRect(x: cx - side / 2, y: cy - side / 2, width: side, height: side)
} else {
    canvasRect = box
}

// 输出（外接框已含留白，透明背景由 CI 保持）
var outImage = masked.cropped(to: canvasRect)
// 平移回原点
outImage = outImage.transformed(by: CGAffineTransform(translationX: -canvasRect.minX,
                                                      y: -canvasRect.minY))

let outLong = max(outImage.extent.width, outImage.extent.height)
if outLong > maxSide {
    let scale = maxSide / outLong
    outImage = outImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
}

let outExtent = outImage.extent.integral
guard let finalCG = ciContext.createCGImage(outImage, from: outExtent) else { fail("最终渲染失败") }

// ---- 5. 写 PNG（保留 alpha）----
let bitmap = NSBitmapImageRep(cgImage: finalCG)
guard let png = bitmap.representation(using: .png, properties: [:]) else { fail("PNG 编码失败") }
let outURL = URL(fileURLWithPath: outPath)
try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(),
                                         withIntermediateDirectories: true)
do {
    try png.write(to: outURL)
} catch {
    fail("写文件失败: \(error.localizedDescription)")
}

let result: [String: Any] = [
    "ok": true,
    "inW": inW, "inH": inH,
    "outW": Int(outExtent.width), "outH": Int(outExtent.height),
    "cover": (cover * 1000).rounded() / 1000,
    "instances": observation.allInstances.count,
    "kb": png.count / 1024,
]
if let d = try? JSONSerialization.data(withJSONObject: result),
   let s = String(data: d, encoding: .utf8) { print(s) }

// ---- 工具：用 alpha 通道求不透明像素外接框 ----
func alphaBounds(_ image: CGImage) -> (box: CGRect, pixels: Int)? {
    let w = image.width, h = image.height
    guard let data = image.dataProvider?.data,
          let ptr = CFDataGetBytePtr(data) else { return nil }
    let bpp = image.bitsPerPixel / 8
    let bpr = image.bytesPerRow
    guard bpp >= 4 else { return nil }
    var minX = w, minY = h, maxX = -1, maxY = -1
    var count = 0
    // alpha 通道通常是最末一个字节（RGBA / BGRA 都是 index 3）
    let aOff = bpp - 1
    for y in 0..<h {
        let row = y * bpr
        for x in 0..<w {
            if ptr[row + x * bpp + aOff] > 16 {
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
                count += 1
            }
        }
    }
    if maxX < 0 || maxY < 0 { return nil }
    return (CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1), count)
}