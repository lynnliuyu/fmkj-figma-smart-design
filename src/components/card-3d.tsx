'use client'

/**
 * 名片 3D 悬浮展示（three.js）。
 *
 * 设计取舍：
 * 1. **卡面用 MeshBasicMaterial**，不用受光材质 —— 这是印刷品预览，
 *    颜色必须和 PNG 一致；打光会让深色版发灰、米白版过曝。
 * 2. **只在侧边和影子用 3D 光照**，用来交代厚度和悬浮感。
 * 3. **贴图是离屏画布截出来的 data URL**，切面就换贴图，不重画版式。
 * 4. 页面不可见 / 标签页切走时停掉渲染循环 —— 不留着白烧 GPU。
 *
 * ⚠️ 这个文件只能被 dynamic(..., { ssr: false }) 加载：
 * three 依赖 window/WebGL，服务端渲染会直接崩。它自己带 'use client'
 * 只是为了让事件处理合法，不代表能进 SSR 图。
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { cn } from '@/lib/utils'

/** 名片比例 1080×648 = 1.6667，三维里取高度 1 作单位 */
const CARD_RATIO = 1080 / 648
const CARD_H3 = 1
const CARD_W3 = CARD_RATIO * CARD_H3
const CARD_D = 0.014
/** 上下漂浮幅度（三维单位） */
const BOB = 0.028
/** OrbitControls.autoRotateSpeed：2.4 ≈ 每 5 秒绕一圈 */
const AUTO_ROTATE_SPEED = 2.4

export type Card3DProps = {
  /** 正面贴图（data URL 或路径） */
  frontSrc: string | null
  /** 背面贴图（data URL 或路径） */
  backSrc: string | null
  /** 侧边颜色：跟着当前面走，深色卡配深侧边 */
  edgeColor?: string
  className?: string
}

export function Card3D({ frontSrc, backSrc, edgeColor = '#1B1E38', className }: Card3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(true)
  // 用 ref 让按钮改状态时不必重建场景
  const spinRef = useRef(true)
  const resetRef = useRef<() => void>(() => {})

  useEffect(() => {
    spinRef.current = spinning
  }, [spinning])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebGL 初始化失败')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0.12, 3.35)

    // 侧边与影子需要光照；卡面是 Basic 材质，不受影响
    scene.add(new THREE.AmbientLight(0xffffff, 1.35))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(-2.2, 3, 3.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xb9a6ff, 0.55)
    rim.position.set(2.6, -1.2, -2)
    scene.add(rim)

    const card = new THREE.Group()
    // 微微前倾，正好露出一点厚度，不是一张死平的纸
    card.rotation.x = -0.055
    scene.add(card)

    const geometry = new THREE.BoxGeometry(CARD_W3, CARD_H3, CARD_D)
    // BoxGeometry 材质顺序：+X, -X, +Y, -Y, +Z, -Z
    //
    // 两面都**不要**翻转 UV：BoxGeometry 的 -Z 面本来就按「从外面看正立」铺图，
    // 再翻一次文字和二维码就成了镜像。
    const faceMat = (src: string | null) => {
      if (!src) return new THREE.MeshBasicMaterial({ color: '#EDE9E0' })
      const tex = new THREE.TextureLoader().load(src)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return new THREE.MeshBasicMaterial({ map: tex })
    }
    const edgeMat = new THREE.MeshStandardMaterial({
      color: edgeColor,
      roughness: 0.55,
      metalness: 0.05,
    })
    const materials = [
      edgeMat,
      edgeMat,
      edgeMat,
      edgeMat,
      faceMat(frontSrc), // +Z 正面
      faceMat(backSrc), // -Z 背面
    ]
    const mesh = new THREE.Mesh(geometry, materials)
    card.add(mesh)

    // 悬浮影子：径向渐变贴图，比真做阴影贴图便宜得多
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 256
    const sctx = shadowCanvas.getContext('2d')!
    const grad = sctx.createRadialGradient(128, 128, 6, 128, 128, 124)
    grad.addColorStop(0, 'rgba(30,26,44,0.42)')
    grad.addColorStop(0.55, 'rgba(30,26,44,0.16)')
    grad.addColorStop(1, 'rgba(30,26,44,0)')
    sctx.fillStyle = grad
    sctx.fillRect(0, 0, 256, 256)
    const shadowTex = new THREE.CanvasTexture(shadowCanvas)
    shadowTex.colorSpace = THREE.SRGBColorSpace
    const shadowGeo = new THREE.PlaneGeometry(CARD_W3 * 0.92, CARD_H3 * 0.92)
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -CARD_H3 / 2 - 0.22
    scene.add(shadow)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.enablePan = false
    controls.minDistance = 2.1
    controls.maxDistance = 5.4
    controls.minPolarAngle = Math.PI * 0.22
    controls.maxPolarAngle = Math.PI * 0.78
    controls.rotateSpeed = 0.85
    controls.target.set(0, 0, 0)

    const reset = () => {
      camera.position.set(0, 0.12, 3.35)
      controls.target.set(0, 0, 0)
      card.rotation.y = 0
      controls.update()
    }
    resetRef.current = reset

    // 拖拽期间暂停自转，松手 1.6s 后恢复，避免「刚拖住就被转走」
    let resumeTimer: number | undefined
    const pauseSpin = () => {
      clearTimeout(resumeTimer)
      controls.autoRotate = false
    }
    const scheduleResume = () => {
      clearTimeout(resumeTimer)
      resumeTimer = window.setTimeout(() => {
        controls.autoRotate = spinRef.current
      }, 1600)
    }
    controls.addEventListener('start', pauseSpin)
    controls.addEventListener('end', scheduleResume)

    controls.autoRotate = spinRef.current
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      controls.autoRotate = false
      setSpinning(false)
    }

    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // 两个方向各算一次「刚好放得下」的距离，取 max：
      // 竖向要容下卡高 + 漂浮 + 影子；横向要容下旋转到斜角时的卡宽。
      // 只按 aspect 线性估会偏大，卡片缩成中间一小块。
      const fovV = (camera.fov * Math.PI) / 180
      const tanV = Math.tan(fovV / 2)
      const needH = 1.18 / tanV
      const needW = (CARD_W3 * 0.54) / tanV / Math.max(camera.aspect, 0.3)
      camera.position.z = Math.min(Math.max(needH, needW), 6)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    // 不可见就停渲染
    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
    })
    io.observe(host)
    const onVisibility = () => {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    const clock = new THREE.Clock()
    // 「暂停旋转」要连漂浮一起停：只停自转的话卡片还在上下晃，
    // 想要定住看细节根本定不住。
    let bobPhase = 0
    let settled = false
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05)
      if (!visible) return
      const isSpinning = spinRef.current && !reduceMotion
      if (isSpinning) {
        bobPhase += dt
        card.position.y = Math.sin(bobPhase * 0.9) * BOB
        card.rotation.x = -0.055 + Math.sin(bobPhase * 0.55) * 0.022
        shadow.scale.setScalar(1 - Math.sin(bobPhase * 0.9) * 0.05)
        settled = false
      } else if (!settled) {
        // 暂停后回到正中静止姿态，停得干净
        card.position.y = 0
        card.rotation.x = -0.055
        shadow.scale.setScalar(1)
        settled = true
      }
      controls.autoRotate = isSpinning
      controls.update(dt)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      clearTimeout(resumeTimer)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      controls.removeEventListener('start', pauseSpin)
      controls.removeEventListener('end', scheduleResume)
      controls.dispose()
      geometry.dispose()
      for (const m of materials) {
        if (m instanceof THREE.MeshBasicMaterial) m.map?.dispose()
        m.dispose()
      }
      shadowGeo.dispose()
      shadowTex.dispose()
      shadowMat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // 贴图变了要重建材质；场景很小，重建代价可忽略
  }, [frontSrc, backSrc, edgeColor])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={hostRef}
        className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-muted"
        style={{ touchAction: 'none' }}
        aria-label="名片三维预览，可拖动旋转"
      >
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            3D 预览不可用：{error}
          </p>
        ) : null}
        {/* 控制条放画布外：窄屏时画布本身很矮，叠在上面会盖住卡片 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center gap-1.5 pb-2.5 sm:flex">
          <button
            type="button"
            onClick={() => setSpinning((v) => !v)}
            className="pointer-events-auto cursor-pointer rounded-full border border-border bg-background/90 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-foreground backdrop-blur hover:bg-background"
          >
            {spinning ? '暂停旋转' : '继续旋转'}
          </button>
          <button
            type="button"
            onClick={() => resetRef.current()}
            className="pointer-events-auto cursor-pointer rounded-full border border-border bg-background/90 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-foreground backdrop-blur hover:bg-background"
          >
            重置视角
          </button>
          <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground backdrop-blur">
            拖动旋转 · 滚轮缩放
          </span>
        </div>
      </div>
      {/* 窄屏：控制条移到画布下方，不遮挡卡片 */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:hidden">
        <button
          type="button"
          onClick={() => setSpinning((v) => !v)}
          className="cursor-pointer rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] whitespace-nowrap text-foreground hover:bg-muted"
        >
          {spinning ? '暂停旋转' : '继续旋转'}
        </button>
        <button
          type="button"
          onClick={() => resetRef.current()}
          className="cursor-pointer rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] whitespace-nowrap text-foreground hover:bg-muted"
        >
          重置视角
        </button>
      </div>
    </div>
  )
}
