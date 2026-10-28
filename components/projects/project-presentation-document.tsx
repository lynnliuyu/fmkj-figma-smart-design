import type * as React from "react"

import { DocumentBrandMark, DocumentContactCard, DocumentPrintFooter } from "@/components/business/document-brand"
import type { DocumentBrand } from "@/lib/document-brand"
import { money } from "@/lib/quote-authoring"
import { deliveryLineTotal, deliveryLineUnitPrice, type ProjectDeliverySnapshot } from "@/lib/project-delivery"
import type { PointMapPrintFloor } from "@/lib/point-map-print"
import { pointMapMarkerLabel } from "@/lib/point-map-labels"
import { quoteVerificationLabel } from "@/lib/quote-verification"

type Props = {
  snapshot: ProjectDeliverySnapshot
  floors: readonly PointMapPrintFloor[]
  brand: DocumentBrand
  selectedSceneId?: string | null
  onSceneSelect?: (id: string) => void
  renderFloorEditor?: (floor: PointMapPrintFloor) => React.ReactNode
  renderFloorAction?: (floor: PointMapPrintFloor) => React.ReactNode
  beforeFloors?: React.ReactNode
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value))
}

/** The interactive preview and both print routes share this exact fixed-version content. */
export function ProjectPresentationDocument({ snapshot, floors, brand, selectedSceneId, onSceneSelect, renderFloorEditor, renderFloorAction, beforeFloors }: Props) {
  const versionLabel = snapshot.version ? `交付版本 V${snapshot.version}` : "当前预览"
  const unplacedPoints = snapshot.plan.points.filter((point) => !point.placed)
  const scenes = snapshot.plan.scenes ?? []

  return <>
    <section className="project-presentation-cover presentation-cover" data-customer-pdf-avoid-break>
      <div className="presentation-brand-row">
        <DocumentBrandMark brand={brand} />
        {brand.qrSrc ? <div className="presentation-contact-qr"><DocumentContactCard brand={brand} /></div> : null}
      </div>
      <div className="presentation-title-row">
        <div><h1>{snapshot.project.name}</h1><p>智能家居方案</p></div>
        <div className="presentation-version"><strong>{versionLabel}</strong><span>{dateLabel(snapshot.createdAt)}</span></div>
      </div>
      <dl className="presentation-project-facts">
        <div><dt>客户</dt><dd>{snapshot.project.customer || "待补充"}</dd></div>
        <div><dt>项目地址</dt><dd>{snapshot.project.address || "待补充"}</dd></div>
        <div><dt>方案范围</dt><dd>{floors.length} 张点位图 · {snapshot.plan.points.length} 个点位 · {scenes.length} 个场景</dd></div>
      </dl>
      <p className="presentation-version-note">{snapshot.version ? `本方案使用交付版本 V${snapshot.version} 的点位、场景与已保存报价。` : "当前为已保存资料预览，生成最新版后保留交付记录。"}</p>
    </section>

    <section className="project-presentation-section presentation-quote">
      <header className="presentation-section-heading"><h2>方案报价</h2><span>{snapshot.quote?.quoteNo || "尚未保存报价"}</span></header>
      {snapshot.quote ? <>
        <dl className="presentation-amounts" data-customer-pdf-avoid-break>
          <div><dt>产品原价</dt><dd>{money(snapshot.quote.subtotal)}</dd></div>
          <div><dt>安装调试</dt><dd>{money(snapshot.quote.installationFee)}</dd></div>
          <div><dt>优惠</dt><dd>{money(snapshot.quote.discount)}</dd></div>
          <div className="presentation-total"><dt>应收总额</dt><dd>{money(snapshot.quote.total)}</dd></div>
        </dl>
        <table className="presentation-quote-table">
          <thead><tr><th scope="col">产品 / 型号与核验</th><th scope="col">房间</th><th scope="col">数量</th><th scope="col">折后单价</th><th scope="col">小计</th></tr></thead>
          <tbody>{snapshot.quote.items.map((item) => <tr key={item.lineId} data-customer-pdf-avoid-break>
            <td><strong>{item.name}</strong><span className="presentation-product-spec">{item.sku || item.spec || item.category}</span><span className="presentation-verification">{quoteVerificationLabel(item)}</span></td>
            <td>{item.room || "全屋"}</td><td>{item.quantity} {item.unit || "个"}</td><td className="presentation-number">{money(deliveryLineUnitPrice(item))}</td><td className="presentation-number presentation-line-total">{money(deliveryLineTotal(item))}</td>
          </tr>)}</tbody>
        </table>
      </> : <p className="presentation-empty">当前项目尚未完成商品选型或保存报价。可先核对点位类别和位置，品牌、型号及数量确认后再生成报价。</p>}
    </section>

    <section className="project-presentation-section presentation-scenes">
      <header className="presentation-section-heading"><h2>场景与控制说明</h2><span>{scenes.length} 个场景</span></header>
      {scenes.length ? <div className="presentation-scene-list">{scenes.map((scene) => <article key={scene.id} className="presentation-scene" data-customer-pdf-avoid-break>
        <div className="presentation-scene-title"><h3>{scene.name}</h3><span>{scene.status === "confirmed" ? "已确认" : "待确认"}</span>
          {onSceneSelect ? <button className="project-presentation-toolbar presentation-scene-action" type="button" aria-pressed={selectedSceneId === scene.id} onClick={() => onSceneSelect(scene.id)}>{selectedSceneId === scene.id ? "取消高亮" : `查看 ${scene.pointIds.length} 个关联点位`}</button> : null}
        </div>
        <dl className="presentation-scene-details"><div><dt>触发</dt><dd>{scene.trigger || "待补充"}</dd></div><div><dt>动作</dt><dd>{scene.description || "待补充"}</dd></div></dl>
        <p className="presentation-scene-points">关联点位：{scene.pointIds.map((id) => { const point = snapshot.plan.points.find((point) => point.id === id); return point ? `${point.room} ${point.code || pointMapMarkerLabel(point)}` : "点位待核对" }).join("、") || "待关联"}</p>
      </article>)}</div> : <p className="presentation-empty">尚未保存场景。可在点位工作台配置触发方式、动作和关联设备，再生成新版。</p>}
    </section>

    {unplacedPoints.length ? <section className="project-presentation-section presentation-unplaced">
      <header className="presentation-section-heading"><h2>待定位设备</h2><span>{unplacedPoints.length} 个点位</span></header>
      <p className="presentation-empty">以下设备尚未确定安装位置，未绘制在点位图中。</p>
      <ul className="presentation-unplaced-list">{unplacedPoints.map((point) => <li key={point.id} data-customer-pdf-avoid-break><strong>{point.code || "编号待补充"} · {pointMapMarkerLabel(point)} · {point.room || "房间待定"}</strong><p>{point.note || "安装位置与配套条件待核对。"}</p></li>)}</ul>
    </section> : null}

    {beforeFloors}

    {floors.length ? <section className="presentation-floor-list" data-floor-count={floors.length}>
      <header className="presentation-section-heading"><h2>楼层点位方案</h2><span>{floors.length} 张图 · 设备位置与配置</span></header>
      {floors.map((floor) => {
        const floorPoints = snapshot.plan.points.filter((point) => point.floorId === floor.id)
        const placed = floorPoints.filter((point) => point.placed).length
        return <section key={floor.id} className="project-presentation-floor presentation-floor" data-customer-pdf-avoid-break>
          <header className="presentation-floor-heading"><h3>{floor.name}</h3><span>{placed} 个已定位{floorPoints.length > placed ? ` · ${floorPoints.length - placed} 个待定位` : ""}</span>{renderFloorAction ? <div className="project-presentation-toolbar">{renderFloorAction(floor)}</div> : null}</header>
          {renderFloorEditor ? <div className="project-presentation-toolbar">{renderFloorEditor(floor)}</div> : null}
          {/* The full map is contained, never cropped to meet the page budget. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={floor.src} alt={`${floor.name} 商品圆形点位方案`} className="presentation-floor-image hidden w-full print:block" />
        </section>
      })}
    </section> : null}
    <DocumentPrintFooter brand={brand} />
  </>
}
