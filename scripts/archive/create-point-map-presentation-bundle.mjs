import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

// Prepare a portable clean-background bundle; the workbench validates and saves it.
const args = process.argv.slice(2)
function argument(name) {
  const value = args[args.indexOf(name) + 1]
  if (!args.includes(name) || !value || value.startsWith("--")) throw new Error(`Missing ${name}`)
  return resolve(value)
}
const planPayload = JSON.parse(readFileSync(argument("--plan"), "utf8"))
const plan = planPayload.plan ?? planPayload.data ?? planPayload
const calibration = JSON.parse(readFileSync(argument("--calibration"), "utf8"))
if (!plan.projectId || !Array.isArray(plan.floors) || !Array.isArray(calibration.floors)) throw new Error("A saved plan and floor calibration are required")
const bundle = {
  format: "fmkj-point-map-presentations", version: 1, projectId: plan.projectId,
  floors: calibration.floors.map((entry) => {
    const matches = plan.floors.filter((floor) => entry.floorId ? floor.id === entry.floorId : floor.name === entry.floorName)
    if (matches.length !== 1) throw new Error(`Floor is missing or ambiguous: ${entry.floorName}`)
    const floor = matches[0]
    const engineering = readFileSync(entry.engineeringFile)
    const match = /^data:image\/[^;]+;base64,(.+)$/.exec(floor.floorplanDataUrl)
    if (!match || !Buffer.from(match[1], "base64").equals(engineering)) throw new Error(`Engineering drawing changed: ${floor.name}`)
    const image = readFileSync(entry.presentationFile)
    if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Expected original PNG style base")
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20)
    if (width !== entry.width || height !== entry.height) throw new Error(`Style dimensions changed: ${floor.name}`)
    return { floorId: floor.id, presentation: {
      name: entry.name || "浅色材质彩平净底", imageDataUrl: `data:image/png;base64,${image.toString("base64")}`,
      imageWidth: width, imageHeight: height,
      sourceFingerprint: createHash("sha256").update(floor.floorplanDataUrl).digest("hex"),
      matrix: entry.matrix, anchors: entry.anchors.map(({ source, target }) => ({ source, target })),
    } }
  }),
}
const output = argument("--output")
writeFileSync(output, JSON.stringify(bundle))
console.log(JSON.stringify({ output, floors: bundle.floors.map((floor) => floor.floorId), bytes: Buffer.byteLength(JSON.stringify(bundle)) }))
