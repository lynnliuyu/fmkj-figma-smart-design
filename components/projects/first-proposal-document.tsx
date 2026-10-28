import * as React from "react"

import type { DocumentBrand } from "@/lib/document-brand"
import { createFirstProposalLayout, firstProposalRooms, type FirstProposalPage, type FirstProposalRoomBand } from "@/lib/first-proposal-print"
import type { PointMapNode, PointMapScene } from "@/lib/point-map-plan"
import type { PointMapPrintFloor } from "@/lib/point-map-print"
import { deliveryLineTotal, deliveryLineUnitPrice, type ProjectDeliveryQuoteItem, type ProjectDeliverySnapshot } from "@/lib/project-delivery"
import { money } from "@/lib/quote-authoring"
import { quoteVerification, quoteVerificationLabel } from "@/lib/quote-verification"

export const FIRST_PROPOSAL_THEMES = {
  warm: {
    name: "暖境 · 生活提案", description: "奶油纸色与生活杂志排版，先讲日常体验，再展开配置与预算。", palette: "米白 / 暖棕",
    heroSrc: "/assets/proposals/warm-living.jpg", sceneSrc: "/assets/proposals/warm-living.jpg", heroAlt: "温暖住宅客厅意向",
    coverLines: ["让家，", "懂你的日常。"],
  },
  atelier: {
    name: "序境 · 空间提案", description: "炭黑封面与铜金细节，以建筑作品集的节奏讲清空间与配置。", palette: "炭黑 / 铜色",
    heroSrc: "/assets/proposals/atelier-living.jpg", sceneSrc: "/assets/proposals/atelier-living.jpg", heroAlt: "暮色现代住宅意向",
    coverLines: ["把生活，", "调到舒适。"],
  },
  nature: {
    name: "自然疗愈 · 日光提案", description: "原木、石材与植物的自然叙事，把光线、空气与舒适写进每个空间。", palette: "原木 / 鼠尾草",
    heroSrc: "/assets/proposals/natural-living.jpg", sceneSrc: "/assets/proposals/nature-bedroom.jpg", heroAlt: "自然疗愈住宅意向",
    coverLines: ["把日光，", "留在生活里。"],
  },
  gallery: {
    name: "光影艺廊 · 空间提案", description: "以画廊般的秩序呈现材质、光影与隐藏式控制，适合强调设计感的客户。", palette: "墨蓝 / 琥珀",
    heroSrc: "/assets/proposals/gallery-living.jpg", sceneSrc: "/assets/proposals/future-living.jpg", heroAlt: "光影艺廊住宅意向",
    coverLines: ["让空间，", "回应生活。"],
  },
} as const

export type FirstProposalTheme = keyof typeof FIRST_PROPOSAL_THEMES

export type FirstProposalDocumentProps = {
  snapshot: ProjectDeliverySnapshot
  floors: PointMapPrintFloor[]
  brand: DocumentBrand
  theme: FirstProposalTheme
  documentRef?: React.Ref<HTMLElement>
  demo?: boolean
}

const QUOTE_SCOPE_NOTE = "报价含基础安装调试，不含强电改造和额外布线费用。最终金额以现场复核和客户确认版本为准。"
const SCENE_BOUNDARY = "「待确认」表示仍需一起商量；「设计已确认」只表示场景设计已确认，不代表设备已经安装或功能已经验收。"

function versionLabel(snapshot: ProjectDeliverySnapshot) {
  return snapshot.version > 0 ? `固定交付 V${snapshot.version}` : "已保存资料预览 · 非固定版本"
}

function pointCaption(point: PointMapNode) {
  const state = point.usage === "reserve" ? "（预留）" : point.usage === "proposed" ? "（待评估）" : ""
  const place = point.placed ? "" : " · 待定位"
  return `${point.code || point.name}${state}${place}`
}

function date(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value || "日期待补充" : parsed.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
}

function reasons(item: ProjectDeliveryQuoteItem) {
  return quoteVerification(item).reasons.join("；")
}

function moodFor(theme: FirstProposalTheme, roomName: string) {
  const meta = FIRST_PROPOSAL_THEMES[theme]
  if (/卧|床|儿童/.test(roomName)) return { src: meta.sceneSrc, alt: `${meta.name}卧室意向` }
  return { src: meta.heroSrc, alt: meta.heroAlt }
}

function projectPhoto(snapshot: ProjectDeliverySnapshot, floorId: string | null) {
  if (!floorId) return ""
  return snapshot.plan.floors?.find((floor) => floor.id === floorId)?.presentation?.imageDataUrl || ""
}

function Brand({ brand, closing = false }: { brand: DocumentBrand; closing?: boolean }) {
  return <div className={`fp-brand${closing ? " fp-brand-closing" : ""}`}>
    {brand.logoSrc ? <img src={brand.logoSrc} alt="" className="fp-brand-logo" /> : null}
    <div><strong>{brand.companyName}</strong>{closing && brand.contact ? <p>{brand.contact}</p> : null}{closing && brand.address ? <p>{brand.address}</p> : null}</div>
  </div>
}

function Footer({ snapshot, brand, demo, label, index, total }: { snapshot: ProjectDeliverySnapshot; brand: DocumentBrand; demo: boolean; label: string; index: number; total: number }) {
  return <footer className="fp-footer"><span>{demo ? "示例演示 · 非客户正式报价" : brand.companyName}</span><span>{label} · {snapshot.version > 0 ? `V${snapshot.version}` : "版本待生成"} · {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></footer>
}

function Page({ children, snapshot, brand, demo, label, index, total, className = "" }: {
  children: React.ReactNode
  snapshot: ProjectDeliverySnapshot
  brand: DocumentBrand
  demo: boolean
  label: string
  index: number
  total: number
  className?: string
}) {
  return <section className={`fp-page ${className}`} aria-label={label} data-fp-page={index}>
    <div className="fp-running"><span>{brand.companyName}</span><span>{snapshot.project.name}</span></div>
    <div className="fp-page-body">{children}</div>
    <Footer snapshot={snapshot} brand={brand} demo={demo} label={label} index={index} total={total} />
  </section>
}

function Heading({ index, title, description, aside }: { index?: string; title: string; description?: string; aside?: string }) {
  return <header className="fp-heading">{index ? <span className="fp-kicker">{index}</span> : null}<div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{aside ? <span>{aside}</span> : null}</header>
}

function Cover({ snapshot, brand, theme, demo, index, total }: Omit<FirstProposalDocumentProps, "floors" | "documentRef"> & { index: number; total: number }) {
  const meta = FIRST_PROPOSAL_THEMES[theme]
  const sidebar = theme === "atelier" || theme === "gallery"
  return <section className={`fp-page fp-cover fp-cover-${theme}`} aria-label="提案封面" data-fp-page={index}>
    <div className="fp-cover-brand"><Brand brand={brand} /><span>{demo ? "示例演示" : "首次提案"}</span></div>
    <div className="fp-cover-title"><h1>{meta.coverLines[0]}<br />{meta.coverLines[1]}</h1><p>全屋智能 · 点位、场景与报价</p></div>
    <div className="fp-cover-composition">
      {sidebar ? <div className="fp-cover-sidebar"><span>{theme === "gallery" ? <>材质有序<br />光影从容</> : <>空间有序<br />生活从容</>}</span><p>{theme === "gallery" ? <>让技术退后，<br />让空间先被感受。</> : <>从一次回家，<br />到每个安心的夜晚。</>}</p><div><strong>{snapshot.project.name}</strong><p>{snapshot.project.customer || "客户信息待补充"}</p></div></div> : null}
      <figure className="fp-cover-image"><img src={meta.heroSrc} alt={meta.heroAlt} /><figcaption>AI 意向示意 · 非项目实景</figcaption></figure>
    </div>
    <div className="fp-cover-project"><div><h2>{snapshot.project.name}</h2><p>{snapshot.project.address || "项目地址待补充"}</p></div><div>{snapshot.project.code ? <span>项目编号 {snapshot.project.code}</span> : null}<span>{snapshot.version > 0 ? `固定交付版本 V${snapshot.version}` : "待生成固定交付版本"}</span><span>{date(snapshot.createdAt)}</span></div></div>
    {!sidebar ? <p className="fp-cover-customer">为 {snapshot.project.customer || "您"} 呈上 · 生活提案 / 分房间场景 / 配置与预算</p> : null}
    <Footer snapshot={snapshot} brand={brand} demo={Boolean(demo)} label={meta.name} index={index} total={total} />
  </section>
}

function SceneCard({ scene, index }: { scene: PointMapScene; index: number }) {
  return <article className="fp-scene" data-scene-id={scene.id}>
    <div className="fp-scene-title"><span className="fp-scene-index">{String(index).padStart(2, "0")}</span><h3>{scene.name || "未命名场景"}</h3><span className={scene.status === "confirmed" ? "fp-status fp-status-confirmed" : "fp-status"}>{scene.status === "confirmed" ? "设计已确认" : "待确认"}</span></div>
    <div className="fp-scene-story"><div><span>当您这样做</span><p>{scene.trigger || "触发方式待沟通"}</p></div><div><span>家会这样回应</span><p>{scene.description || "具体动作待沟通"}</p></div></div>
  </article>
}

function QuoteLine({ item, snapshot }: { item: ProjectDeliveryQuoteItem; snapshot: ProjectDeliverySnapshot }) {
  const archived = snapshot.products.find((product) => product.id === item.id)
  const src = archived?.image || item.image
  const note = reasons(item)
  return <div className="fp-room-line" data-quote-line={item.lineId}>
    {src ? <img src={src} alt="" /> : <span className="fp-room-line-fallback" aria-hidden="true" />}
    <div>
      <strong>{item.name}</strong>
      <span>{[item.brand, item.sku].filter(Boolean).join(" · ")}</span>
      <span>{item.quantity} {item.unit || "个"} · 折后单价 {money(deliveryLineUnitPrice(item))}</span>
      <span className="fp-verification">{quoteVerificationLabel(item)}</span>
      {note ? <span className="fp-verification-reason">{note}</span> : null}
    </div>
    <strong>{money(deliveryLineTotal(item))}</strong>
  </div>
}

function RoomBand({ band, snapshot, floors, theme, sceneStart }: {
  band: FirstProposalRoomBand
  snapshot: ProjectDeliverySnapshot
  floors: PointMapPrintFloor[]
  theme: FirstProposalTheme
  sceneStart: number
}) {
  const points = band.pointIds.map((id) => snapshot.plan.points.find((point) => point.id === id)).filter((point): point is PointMapNode => Boolean(point))
  const scenes = band.sceneIds.map((id) => snapshot.plan.scenes?.find((scene) => scene.id === id)).filter((scene): scene is PointMapScene => Boolean(scene))
  const byLine = new Map((snapshot.quote?.items ?? []).map((item) => [item.lineId, item]))
  const items = band.lineIds.map((id) => byLine.get(id)).filter((item): item is ProjectDeliveryQuoteItem => Boolean(item))
  const floor = floors.find((entry) => entry.id === band.floorId)
  const photo = projectPhoto(snapshot, band.floorId)
  const mood = moodFor(theme, band.roomName)
  const subtotal = (firstProposalRooms(snapshot).find((room) => room.name === band.roomName)?.items ?? []).reduce((sum, item) => sum + deliveryLineTotal(item), 0)
  return <div className="fp-room-band" data-room-name={band.roomName}>
    {band.showVisual ? <div className="fp-room-stage">
      <figure className="fp-room-photo">
        <img src={photo || mood.src} alt={photo ? `${band.roomName}项目原图` : mood.alt} />
        {points.length ? <ul className="fp-point-chips">{points.slice(0, 8).map((point, index) => <li key={point.id}><em>{String(index + 1).padStart(2, "0")}</em>{pointCaption(point)}</li>)}</ul> : null}
        <figcaption>{photo ? "项目原图" : "AI 意向示意 · 非项目实景"}</figcaption>
      </figure>
      <div className="fp-room-side">
        {scenes.map((scene, index) => <SceneCard key={scene.id} scene={scene} index={sceneStart + index} />)}
        {band.showEmptyScene ? <p className="fp-room-empty">这个房间还没有已保存的场景。</p> : null}
        {band.showBoundary ? <p className="fp-boundary">{SCENE_BOUNDARY}</p> : null}
      </div>
    </div> : null}
    {!band.showVisual && scenes.length ? <div className="fp-room-side fp-room-side-continued">{scenes.map((scene, index) => <SceneCard key={scene.id} scene={scene} index={sceneStart + index} />)}</div> : null}
    {band.showPlan && floor ? <div className="fp-room-plan">
      <figure><img src={floor.src} alt={`${floor.name}点位图`} data-floor-id={floor.id} /><figcaption>{floor.name} · 点位图</figcaption></figure>
      <ol className="fp-point-list">{points.map((point, index) => <li key={point.id}><em>{String(index + 1).padStart(2, "0")}</em><span>{pointCaption(point)}</span><small>{point.name}</small></li>)}</ol>
    </div> : points.length && band.showVisual ? <ol className="fp-point-list">{points.map((point, index) => <li key={point.id}><em>{String(index + 1).padStart(2, "0")}</em><span>{pointCaption(point)}</span><small>{point.name}</small></li>)}</ol> : null}
    {items.length ? <div className="fp-room-lines">{items.map((item) => <QuoteLine key={item.lineId} item={item} snapshot={snapshot} />)}</div> : null}
    {band.showSubtotal ? <p className="fp-room-subtotal"><span>{band.roomName}设备小计</span><strong>{money(subtotal)}</strong></p> : null}
  </div>
}

function Overview({ page, snapshot, floors, pageNo, total, common }: {
  page: Extract<FirstProposalPage, { kind: "overview" }>
  snapshot: ProjectDeliverySnapshot
  floors: PointMapPrintFloor[]
  pageNo: number
  total: number
  common: { snapshot: ProjectDeliverySnapshot; brand: DocumentBrand; demo: boolean }
}) {
  const scenes = snapshot.plan.scenes ?? []
  const shownFloors = floors.filter((floor) => page.floorIds.includes(floor.id))
  const sceneNames = scenes.map((scene) => scene.name).filter(Boolean)
  const lead = sceneNames.length > 4
    ? `已保存 ${scenes.length} 项场景，触发和动作写在对应房间页。`
    : sceneNames.length
      ? `已保存场景：${sceneNames.join("、")}。`
      : ""
  return <Page {...common} index={pageNo} total={total} label={page.lead ? "全屋总览" : "全屋总览 · 续"} className="fp-overview-page">
    <Heading index={page.lead ? "02" : undefined} title={page.lead ? "从这一家的房间看起。" : "点位图和房间接着看。"} description={page.lead ? `先看整张点位图和每个房间有多少点，再进入房间页对照场景和报价。${lead}` : "上一页没放下的楼层图和房间，接在这里。"} aside={`${snapshot.plan.points.length} 处点位`} />
    {page.lead && !scenes.length ? <div className="fp-empty"><h3>先聊习惯，再定义场景。</h3><p>本版本尚未保存场景，暂不将生活设想写成已包含功能。建议从回家、休息与离家等时刻聊起，确认触发方式、动作和关联设备后，再补入下一版提案。</p></div> : null}
    {shownFloors.length ? <div className="fp-overview-plans">{shownFloors.map((floor) => <figure key={floor.id}><img src={floor.src} alt={`${floor.name}完整点位设计图`} data-floor-id={floor.id} /><figcaption>{floor.name} · {snapshot.version > 0 ? "同一固定版本的楼层图" : "已保存资料预览，尚未形成固定交付版本"}</figcaption></figure>)}</div> : page.lead ? <p className="fp-scope-note">本版还没有可附上的楼层点位图。房间页仍会列出已保存的点位编号。</p> : null}
    {page.roomNames.length ? <div className="fp-room-index"><h3>空间清单</h3>{page.roomNames.map((name) => {
      const room = firstProposalRooms(snapshot).find((entry) => entry.name === name)
      const codes = (room?.points ?? []).map((point) => point.code || point.name).join("、")
      return <div className="fp-room-row" key={name}><div><strong>{name}</strong><span>{room?.points.length ?? 0} 处点位 · {room?.items.length ?? 0} 行报价</span></div><p>{codes ? `点位 ${codes}` : "点位编号、场景和金额在后面的房间页。"}</p></div>
    })}</div> : page.lead ? <p className="fp-empty">本版尚未保存房间配置。空间范围与设备选择需要沟通后补充。</p> : null}
  </Page>
}

function RoomPage({ page, snapshot, floors, theme, pageNo, total, sceneStart, common }: {
  page: Extract<FirstProposalPage, { kind: "room" }>
  snapshot: ProjectDeliverySnapshot
  floors: PointMapPrintFloor[]
  theme: FirstProposalTheme
  pageNo: number
  total: number
  sceneStart: number
  common: { snapshot: ProjectDeliverySnapshot; brand: DocumentBrand; demo: boolean }
}) {
  const title = page.bands.map((band) => band.roomName).join(" · ")
  let cursor = sceneStart
  return <Page {...common} index={pageNo} total={total} label={title} className={`fp-room-page${page.bands.length > 1 ? " fp-room-pair" : ""}${page.continuation ? " fp-room-continued" : ""}`}>
    <Heading title={page.continuation ? `${title}（续）` : title} description={page.continuation ? "这一页接着写同一房间的场景和报价。" : "同一页对照：空间示意、点位、场景和本区报价。"} aside={page.continuation ? "续页" : "分房间"} />
    {page.bands.map((entry) => {
      const start = cursor
      cursor += entry.sceneIds.length
      return <RoomBand key={entry.roomName + entry.lineIds.join(",") + entry.sceneIds.join(",")} band={entry} snapshot={snapshot} floors={floors} theme={theme} sceneStart={start} />
    })}
  </Page>
}

function QuoteTable({ items }: { items: ProjectDeliveryQuoteItem[] }) {
  return <table className="fp-quote-table"><colgroup><col className="fp-col-product" /><col className="fp-col-room" /><col className="fp-col-quantity" /><col className="fp-col-money" /><col className="fp-col-money" /><col className="fp-col-money" /></colgroup><thead><tr><th>产品 / 规格与说明</th><th>房间</th><th>数量</th><th>原单价</th><th>折后单价</th><th>折后小计</th></tr></thead><tbody>{items.map((item) => <tr key={item.lineId} data-quote-line={item.lineId}><td><strong>{item.name}</strong><span>{[item.brand, item.sku].filter(Boolean).join(" · ")}</span>{item.spec ? <span>{item.spec}</span> : null}<span className="fp-verification">{quoteVerificationLabel(item)}</span>{reasons(item) ? <span className="fp-verification-reason">{reasons(item)}</span> : null}</td><td>{item.room || "全屋"}</td><td>{item.quantity}<br />{item.unit || "个"}</td><td>{money(item.price)}</td><td>{money(deliveryLineUnitPrice(item))}</td><td><strong>{money(deliveryLineTotal(item))}</strong></td></tr>)}</tbody></table>
}

function ConfirmBlock({ snapshot, brand, merged }: { snapshot: ProjectDeliverySnapshot; brand: DocumentBrand; merged?: boolean }) {
  const unplaced = snapshot.plan.points.filter((point) => !point.placed)
  const unverified = snapshot.quote?.items.filter((item) => quoteVerification(item).status === "unverified") ?? []
  const proposed = snapshot.plan.scenes?.filter((scene) => scene.status !== "confirmed") ?? []
  const quotedPointIds = new Set((snapshot.quote?.items ?? []).flatMap((item) => item.pointIds ?? []))
  const pointsToCheck = snapshot.plan.points.filter((point) => !quotedPointIds.has(point.id) && point.usage !== "reserve" && point.usage !== "proposed")
  return <div className={`fp-confirm${merged ? " fp-confirm-merged" : ""}`}>
    <h3>把要留的生活，确认下来。</h3>
    {!merged ? <ol className="fp-next-steps"><li><strong>先对场景</strong><span>哪些触发和动作贴近日常</span></li><li><strong>再对点位</strong><span>位置、外观和现场条件</span></li><li><strong>最后对报价</strong><span>保留项、调整项和未报范围</span></li></ol> : null}
    <div className="fp-confirm-grid"><div><h3>本版待沟通事项</h3><ul>{proposed.length ? <li>{proposed.length} 项场景待确认：{proposed.map((scene) => scene.name).join("、")}</li> : <li>生活场景与操作习惯可在沟通时继续补充。</li>}{unplaced.length ? <li>{unplaced.length} 处设备待定位：{unplaced.map((point) => `${point.room || "房间待定"} ${point.code || point.name}`).join("、")}</li> : null}{unverified.length ? <li>{unverified.length} 行产品尚未核验，具体原因及未报配套见报价表。</li> : null}<li>设计点位不等于已报价范围。预留、待评估点位不直接形成采购数量。</li>{pointsToCheck.length ? <li>{pointsToCheck.length} 处点位尚未与报价行明确关联，需核对是否已由手动报价覆盖。</li> : null}<li>工期、付款、质保及售后范围：待双方另行约定，本提案不预设承诺。</li></ul></div><div><h3>签字</h3><div className="fp-confirmation-sign"><div><span>客户沟通确认</span><i /></div><div><span>沟通日期</span><i /></div></div><p className="fp-confirmation-note">此处只记录这次沟通的意见。范围和价格以双方另行确认的文件为准。</p></div></div>
    <div className="fp-closing"><div>{merged ? null : <h3>为日常留一点从容。</h3>}<Brand brand={brand} closing /></div>{brand.qrSrc ? <figure><img src={brand.qrSrc} alt="联系二维码" /><figcaption>扫码联系</figcaption></figure> : null}</div>
  </div>
}

function QuotePage({ page, snapshot, brand, demo, pageNo, total }: {
  page: Extract<FirstProposalPage, { kind: "quote" }>
  snapshot: ProjectDeliverySnapshot
  brand: DocumentBrand
  demo: boolean
  pageNo: number
  total: number
}) {
  const quote = snapshot.quote
  const items = (quote?.items ?? []).filter((item) => page.lineIds.includes(item.lineId))
  return <Page snapshot={snapshot} brand={brand} demo={demo} index={pageNo} total={total} label={page.continued ? "完整报价 · 续" : "完整报价"} className="fp-quote-page">
    <Heading title={page.continued ? "报价接着列。" : "每一项选择，都清楚列明。"} description="下面是本版保存的全部报价行。房间页里的小计只方便对照，应收总额以本表为准。" aside={quote?.quoteNo} />
    {quote ? <>
      {items.length ? <QuoteTable items={items} /> : <p className="fp-empty">本版尚未保存报价，暂无可列示的产品金额。</p>}
      {page.showSummary ? <div className="fp-quote-summary"><div><span>产品原价</span><strong>{money(quote.subtotal)}</strong></div><div><span>优惠金额</span><strong>{money(quote.discount)}</strong></div><div><span>安装调试</span><strong>{money(quote.installationFee)}</strong></div><div><span>本版应收总额</span><strong>{money(quote.total)}</strong></div></div> : <p className="fp-quote-continued">报价明细续下页；完整合计见本组末页。</p>}
      <p className="fp-scope-note">{QUOTE_SCOPE_NOTE}</p>
    </> : <p className="fp-empty">本版尚未保存报价，暂无可列示的产品金额。</p>}
    {page.includeConfirm ? <ConfirmBlock snapshot={snapshot} brand={brand} merged /> : null}
  </Page>
}

/** All content comes from one immutable delivery; the component never fetches or reprices products. */
export function FirstProposalDocument({ snapshot, floors, brand, theme, documentRef, demo = false }: FirstProposalDocumentProps) {
  const layout = createFirstProposalLayout(snapshot, floors)
  const common = { snapshot, brand, demo }
  const total = layout.pages.length
  let sceneCursor = 1
  return <article ref={documentRef} className={`first-proposal-document fp-theme-${theme}${layout.density === "compact" ? " fp-density-compact" : ""}`} data-proposal-theme={theme} data-proposal-density={layout.density} data-proposal-page-count={total} data-proposal-over-budget={layout.overBudget ? "true" : "false"}>
    {layout.pages.map((page, index) => {
      const pageNo = index + 1
      if (page.kind === "cover") return <Cover key="cover" {...common} theme={theme} index={pageNo} total={total} />
      if (page.kind === "overview") return <Overview key={`overview-${index}`} page={page} snapshot={snapshot} floors={floors} pageNo={pageNo} total={total} common={common} />
      if (page.kind === "room") {
        const start = sceneCursor
        sceneCursor += page.bands.reduce((sum, band) => sum + band.sceneIds.length, 0)
        return <RoomPage key={`room-${index}`} page={page} snapshot={snapshot} floors={floors} theme={theme} pageNo={pageNo} total={total} sceneStart={start} common={common} />
      }
      if (page.kind === "quote") return <QuotePage key={`quote-${index}`} page={page} snapshot={snapshot} brand={brand} demo={Boolean(demo)} pageNo={pageNo} total={total} />
      return <Page key="confirm" {...common} index={pageNo} total={total} label="沟通与确认" className="fp-confirmation-page"><Heading title="下一步，只确认这几件事。" description="初次提案先把范围和待定项写清楚。付款、工期和质保不在这里预设。" /><ConfirmBlock snapshot={snapshot} brand={brand} /></Page>
    })}
  </article>
}
