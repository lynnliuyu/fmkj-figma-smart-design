# 外网访问：服务器只配一次（已在 150.158.3.164 实跑通过）

目标：**新加一个客户时不用再碰服务器**。每加一个客户，只在客户设备上跑一条命令。

已在 150.158.3.164（Debian 13 / Caddy v2.11）真实部署并验证：客户子域名拿到 Let's Encrypt
证书、访问到设备、公网自检 7/7 通过。

## 一、服务器上（一次性；四个文件都在本目录）

```bash
# 1) frps（穿透服务端）
mkdir -p /opt/frps && install -m 755 frps /opt/frps/frps
install -m 600 frps.toml /opt/frps/frps.toml     # 改里面的 auth.token
# 装成 systemd 服务：ExecStart=/opt/frps/frps -c /opt/frps/frps.toml
systemctl enable --now frps

# 2) 证书按需签发的校验端点（Caddy 要求的防滥用机制）
install -m 755 tls-ask.py /opt/frps/tls-ask.py
install -m 644 fmkj-tls-ask.service /etc/systemd/system/
systemctl enable --now fmkj-tls-ask

# 3) Caddy：把本目录 Caddyfile 里的 *.你的域名 块并进 /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

DNS：一条泛解析 `*.你的域名 → 服务器IP`（一次性）。客户子域名的证书在第一次访问时自动签发。

防火墙只开：`443`（客户访问）、`80`（证书签发与跳转）、`17000`（设备连上来）。
`18080` 只监听本机（frps 的 proxyBindAddr），**不要**对外。

## 二、每加一个客户（一条命令，在客户设备上）

```bash
bash enable-public-access.sh --host dealer01.你的域名 \
  --server 服务器IP:17000 --token "$(cat /opt/frps/.token)" --check
```

装机时也可以一并开通：`install-appliance.sh ... --public-host dealer01.你的域名 \
--tunnel-server 服务器IP:17000 --tunnel-token '<token>'`。

## 三、两个只有真部署才会踩到的坑（务必照做）

1. **Caddy 不允许"谁指向本机就给谁签证书"**：`tls { on_demand }` 必须配一个「许可模块」，
   否则整个配置校验失败（`on-demand TLS cannot be enabled without a permission module`）。
   → 用 `tls-ask.py`，在全局块里 `on_demand_tls { ask http://127.0.0.1:18321/tls-ask }`。
   它只放行 `*.你的域名`，别人把域名指过来也签不出来。

2. **已有站点和新通配站共存时，已有站点的证书不会被加载**：加了 `*.fmkj.top` 之后，
   原来的 `xgj.fmkj.top` 握手直接失败（`no certificate available`，但证书文件还在磁盘上）。
   → 给那个已有站点也加 `tls { on_demand }`，握手时会先从存储取已有证书（取不到才申请）。
   实跑验证：加完后 `https://xgj.fmkj.top/` 恢复 200。

## 四、限速与容量

- 每个客户 frpc 配置里默认 `transport.bandwidthLimit = "2MB"`（≈16Mbps），一家占不满线路。
- 实测：产品库一次加载 1.2MB，经 Caddy gzip 压缩后 **122KB**；10Mbps 约带 30–50 家，
  30–50Mbps 约带 150–250 家。
- frp 服务端几乎不占资源：几百个客户端也就是几十 MB 内存，瓶颈是带宽。

## 五、frp token 是全局的

开源版 frp 不支持每客户一个 token。当成密码保管；设备退役或怀疑泄露就换（设备端重跑开通命令）。
