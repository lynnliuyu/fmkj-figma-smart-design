#!/usr/bin/env node
/**
 * 给版本清单签名（运营方侧执行，设备侧只拿公钥验）。
 *
 * 为什么需要：设备靠「你发布的版本清单」决定要不要升级。没有签名时，任何能替换这份
 * 清单的人都能把设备引到一个恶意镜像上。签名解决的是「发布者身份」，摘要只能解决
 * 「传输没坏」。
 *
 * 用法：
 *   node scripts/deploy/sign-version-index.mjs --file versions.json --key release-private.pem
 *   node scripts/deploy/sign-version-index.mjs --file versions.json --key k.pem --out versions.signed.json
 *
 * 输入可以是 ["v0.1.0","v0.1.1"]，也可以是 {"versions":[...]}；输出统一为
 * {"versions":[...], "signature":"<base64>"}，设备端用 UPSTREAM 同一套 Ed25519 公钥校验。
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createPrivateKey, sign } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function versionsMessage(versions) {
  return (versions ?? []).map((value) => String(value).trim()).filter(Boolean).join("\n")
}

export function signVersions(versions, privateKeyPem) {
  return sign(null, Buffer.from(versionsMessage(versions), "utf8"), createPrivateKey(privateKeyPem)).toString("base64")
}

export function parseArgs(argv) {
  const options = { file: "", key: "", out: "" }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--file") options.file = argv[++index]
    else if (arg === "--key") options.key = argv[++index]
    else if (arg === "--out") options.out = argv[++index]
  }
  if (!options.file) throw new Error("缺少 --file <版本清单.json>")
  if (!options.key) throw new Error("缺少 --key <私钥.pem>（只放在运营方服务器上，不要带到设备）")
  return options
}

export function signIndexFile(options) {
  const payload = JSON.parse(readFileSync(options.file, "utf8"))
  const versions = Array.isArray(payload) ? payload : payload?.versions
  if (!Array.isArray(versions) || !versions.length) throw new Error("版本清单里没有 versions 数组")
  const signed = { versions: versions.map(String), signature: signVersions(versions, readFileSync(options.key, "utf8")) }
  const out = options.out || options.file.replace(/\.json$/i, "") + ".signed.json"
  writeFileSync(out, `${JSON.stringify(signed, null, 2)}\n`, "utf8")
  return { out, count: signed.versions.length }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = signIndexFile(options)
  console.log(`已签名 ${result.count} 个版本 → ${resolve(result.out)}`)
  console.log("把这个文件放到设备的 FMKJ_UPDATE_INDEX_URL，并把对应公钥写进 FMKJ_RELEASE_PUBLIC_KEY。")
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
