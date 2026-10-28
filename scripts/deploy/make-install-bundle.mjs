#!/usr/bin/env node
/**
 * 打一个装机包：新设备要用的东西全在里面（不含镜像，镜像由设备从你的仓库拉）。
 *
 *   node scripts/deploy/make-install-bundle.mjs --version v0.3.5
 *   → dist/fmkj-install-v0.3.5.tar.gz（几百 KB，U 盘或 scp 拷过去都行）
 *
 * 包里的 install-appliance.sh 会做剩下的全部事情：生成密钥、拉镜像、起库、建表、起应用、
 * 装更新管家、自检。管理员账号由客户第一次打开页面时自己设。
 */
import { execFile } from "node:child_process"
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)

export function parseBundleArgs(argv) {
  const options = { version: "", out: "" }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--version") options.version = argv[++index]
    else if (arg === "--out") options.out = argv[++index]
  }
  if (!options.version) throw new Error("缺少 --version <版本>：装机包里要写清楚这一版是谁")
  return options
}

const README = (version) => `# FMKJ 设备装机包 ${version}

## 怎么用（每台新设备）

1. 按你现有的刷法给设备刷系统（Armbian，与本机同型号），接上网线，记下设备 IP。
2. 把这个包拷到设备上：

   \`\`\`bash
   scp fmkj-install-${version}.tar.gz root@<设备IP>:/tmp/
   ssh root@<设备IP>
   mkdir -p /tmp/fmkj-bundle && tar xzf /tmp/fmkj-install-${version}.tar.gz -C /tmp/fmkj-bundle
   \`\`\`

3. 跑装机（把 <自建仓库> 换成你的镜像仓库地址）：

   \`\`\`bash
   cd /tmp/fmkj-bundle && bash install-appliance.sh \\
     --registry <自建仓库>/fmkj-v3 --version ${version}
   \`\`\`

4. 打开 http://<设备IP>:3000 —— 第一次会引导客户自己设置管理员账号（名字、邮箱、密码）。

装机脚本会自己检查环境（root、docker、磁盘、容器名冲突），不满足就直接拒绝并说明原因；
最后会跑一遍自检，没过会明确写「先别交付」。已经装过的设备默认拒绝重跑，加 --repair 才是修复。

只想看它会做什么：给脚本加 --dry-run。

## 包里有什么

- install-appliance.sh        一键装机
- docker-compose.appliance*.yml  编排（自带库 / 外部库两种）
- scripts/                    宿主机侧脚本（更新、检查、备份、自检）与应用侧脚本
- deploy/systemd/             更新管家、每日检查、首次开机初始化的 systemd 服务

## 客户要「外网网址访问」（可选）

设备侧一条命令就开通（服务器端只需一次性配好，见包里的 deploy/public-access/server/）：

    bash scripts/deploy/enable-public-access.sh \
      --host dealer01.你的域名.com --server 你的服务器IP:17000 \
      --token 'frps 里的 auth.token' --check

装机时也可以直接带上，装完就是通的：

    bash install-appliance.sh --registry ... --version ... \
      --public-host dealer01.你的域名.com --tunnel-server 你的服务器IP:17000 --tunnel-token '...'

关闭：bash scripts/deploy/enable-public-access.sh --disable

## 批量出货（母盘）

一台台装嫌慢时：把一台母机装好，然后

    bash /opt/fmkj/app/scripts/deploy/prepare-golden.sh --yes

它会清掉客户数据、附件、备份、日志与密钥并打上「待初始化」标记，然后关机。
把这张卡/这块 eMMC 读成镜像刷到新设备，新设备第一次开机会自动生成自己的密钥、
重建数据库 —— 客户打开页面设置管理员即可。详见 docs/local-appliance-deployment.md 的 2.4。
`

export async function makeBundle(options, dependencies = {}) {
  const log = dependencies.log ?? ((message) => console.log(message))
  const root = dependencies.root ?? process.cwd()
  const stage = resolve(root, "dist", `fmkj-install-${options.version}`)
  const archive = options.out || resolve(root, "dist", `fmkj-install-${options.version}.tar.gz`)

  await rm(stage, { force: true, recursive: true })
  await mkdir(stage, { recursive: true })

  for (const file of ["docker-compose.appliance.yml", "docker-compose.appliance-external-db.yml"]) {
    await cp(resolve(root, file), resolve(stage, file))
  }
  await cp(resolve(root, "scripts/deploy/install-appliance.sh"), resolve(stage, "install-appliance.sh"))
  await cp(resolve(root, "scripts"), resolve(stage, "scripts"), { recursive: true })
  await mkdir(resolve(stage, "deploy"), { recursive: true })
  await cp(resolve(root, "deploy/systemd"), resolve(stage, "deploy/systemd"), { recursive: true })
  // 服务器侧的外网穿透模板（喂给运营方自己的服务器，客户不需要）
  await cp(resolve(root, "deploy/public-access"), resolve(stage, "deploy/public-access"), { recursive: true })
  await writeFile(resolve(stage, "README-装机.md"), README(options.version), "utf8")

  // 应用侧不需要的脚本别塞进包里（PC 机上的开发工具），保持包小、拷起来快。
  const skip = ["build-release.mjs", "make-device-card.py", "make-install-bundle.mjs", "sign-version-index.mjs"]
  // 装机包不删 prepare-golden.sh / first-boot.sh：母盘流程也用同一个包。
  // updater-agent.mjs 是宿主机更新服务的入口，必须随包安装，不能当作开发工具排除。
  for (const file of skip) await rm(resolve(stage, "scripts/deploy", file), { force: true })
  await rm(resolve(stage, "scripts/deploy/__pycache__"), { force: true, recursive: true })

  for (const file of ["updater-agent.mjs", "update-local.mjs", "check-update.mjs", "backup-local.mjs"]) {
    try {
      await access(resolve(stage, "scripts/deploy", file))
    } catch {
      throw new Error(`装机包缺少设备更新所需的 scripts/deploy/${file}，已停止打包`)
    }
  }

  await run("tar", ["czf", archive, "-C", stage, "."])
  const { stdout } = await run("du", ["-h", archive])
  log(`装机包：${archive}（${stdout.split("\t")[0]}）`)
  log(`用法：scp ${archive} root@<设备IP>:/tmp/ 然后按包里的 README-装机.md 走`)
  return { archive, stage }
}

async function main() {
  await makeBundle(parseBundleArgs(process.argv.slice(2)))
}

// 路径里有中文时 import.meta.url 会百分号编码，必须用 fileURLToPath 比，不能手拼字符串。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
