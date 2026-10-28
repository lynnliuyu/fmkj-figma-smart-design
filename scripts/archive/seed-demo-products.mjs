import { Client } from "pg"

const MIJIA = "\u7c73\u5bb6"
const OTHER = "\u5176\u4ed6"
const LIGHTING = "\u667a\u80fd\u706f\u5177"
const SWITCH = "\u5f00\u5173"
const CURTAIN = "\u7a97\u5e18"
const SENSOR = "\u4f20\u611f\u5668"
const GATEWAY = "\u7f51\u5173\u4e2d\u63a7"
const LOCK = "\u95e8\u9501"
const CAMERA = "\u76d1\u63a7"
const NETWORK = "\u5168\u5c4bwifi"
const UNIT_ITEM = "\u4e2a"
const UNIT_LIGHT = "\u76cf"
const UNIT_SET = "\u5957"
const UNIT_DEVICE = "\u53f0"
const UNIT_TASK = "\u9879"

const products = [
  product("DEMO-LIGHT-001", "Yeelight Pro Smart Downlight 7W", "\u6613\u6765/yeelight", MIJIA, LIGHTING, UNIT_LIGHT, 129, 82, 60, "Anti-glare smart downlight for living rooms and corridors.", [LIGHTING, "downlight", MIJIA]),
  product("DEMO-LIGHT-002", "Yeelight Pro Smart Spotlight 9W", "\u6613\u6765/yeelight", MIJIA, LIGHTING, UNIT_LIGHT, 159, 98, 48, "Accent spotlight for TV walls, artwork, and display cabinets.", [LIGHTING, "spotlight"]),
  product("DEMO-LIGHT-003", "Magnetic Track Light Kit 2m", OTHER, OTHER, LIGHTING, UNIT_SET, 899, 620, 15, "Basic 2m magnetic track lighting kit with power module.", [LIGHTING, "track light"]),
  product("DEMO-SWITCH-001", "Aqara D1 Smart Wall Switch 3-Key", "Aqara", MIJIA, SWITCH, UNIT_ITEM, 189, 126, 40, "Three-key smart wall switch for multi-circuit lighting control.", [SWITCH, "zero-live", "three-key"]),
  product("DEMO-SWITCH-002", "Wireless Scene Knob Switch", "Aqara", MIJIA, SWITCH, UNIT_ITEM, 199, 132, 30, "Wireless knob controller for brightness, color temperature, and scenes.", [SWITCH, "scene", "wireless"]),
  product("DEMO-CURTAIN-001", "Aqara Smart Curtain Motor C3", "Aqara", MIJIA, CURTAIN, UNIT_SET, 699, 470, 18, "Quiet curtain motor with schedule, voice, and scene automation.", [CURTAIN, "motor"]),
  product("DEMO-CURTAIN-002", "Electric Curtain Straight Rail 3m", OTHER, OTHER, CURTAIN, UNIT_SET, 360, 240, 22, "Three-meter straight rail for mainstream smart curtain motors.", [CURTAIN, "rail"]),
  product("DEMO-SENSOR-001", "Aqara Human Presence Sensor FP2", "Aqara", MIJIA, SENSOR, UNIT_ITEM, 599, 410, 12, "Presence detection sensor for lighting automation and occupancy logic.", [SENSOR, "presence"]),
  product("DEMO-SENSOR-002", "Aqara Door and Window Sensor P2", "Aqara", OTHER, SENSOR, UNIT_ITEM, 169, 112, 35, "Door/window open-close sensor for security and lighting automations.", [SENSOR, "door-window"]),
  product("DEMO-SENSOR-003", "Aqara Water Leak Sensor", "Aqara", MIJIA, SENSOR, UNIT_ITEM, 99, 62, 50, "Leak warning sensor for kitchens, balconies, and bathrooms.", [SENSOR, "water-leak"]),
  product("DEMO-GATEWAY-001", "Aqara Hub M3", "Aqara", OTHER, GATEWAY, UNIT_ITEM, 899, 640, 10, "Smart home hub with multi-protocol access and local automations.", [GATEWAY, "hub"]),
  product("DEMO-GATEWAY-002", "Smart Home Control Panel 6 inch", OTHER, OTHER, GATEWAY, UNIT_DEVICE, 1280, 890, 8, "Wall-mounted control panel for scenes and device overview.", [GATEWAY, "panel"]),
  product("DEMO-LOCK-001", "Aqara Fingerprint Smart Door Lock", "Aqara", MIJIA, LOCK, UNIT_SET, 1899, 1320, 9, "Smart lock with fingerprint, password, temporary password, and access logs.", [LOCK, "lock"]),
  product("DEMO-CAMERA-001", "Aqara Indoor Pan-Tilt Camera 2K", "Aqara", MIJIA, CAMERA, UNIT_DEVICE, 299, 198, 25, "Indoor camera with motion tracking and privacy mode.", [CAMERA, "camera"]),
  product("DEMO-NETWORK-001", "Gigabit Switch 8-Port", OTHER, OTHER, NETWORK, UNIT_DEVICE, 229, 150, 20, "Eight-port gigabit switch for home network cabinets.", [NETWORK, "switch"]),
  product("DEMO-NETWORK-002", "Ruijie Ceiling Wi-Fi 7 AP", "\u9510\u6377/Ruijie", OTHER, NETWORK, UNIT_DEVICE, 699, 480, 16, "Ceiling wireless AP for large apartments and villa coverage.", [NETWORK, "AP", "Wi-Fi 7"]),
  product("DEMO-SCENE-001", "Home Arrival Scene Package", OTHER, OTHER, OTHER, UNIT_SET, 1299, 880, 10, "Starter scene package for door lock linkage and entry lighting.", [OTHER, "arrival"]),
  product("DEMO-SCENE-002", "Whole-Home Lighting Commissioning Service", OTHER, OTHER, OTHER, UNIT_TASK, 1500, 900, 999, "Basic lighting grouping, scene, and automation commissioning service.", [OTHER, "commissioning"]),
]

function product(sku, name, brand, platform, category, unit, price, cost, stock, description, tags) {
  return { sku, name, brand, platform, category, unit, price, cost, stock, description, tags }
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const client = new Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
})

await client.connect()

try {
  const actorId = await getActorId()
  let upserted = 0

  for (const item of products) {
    await client.query(
      `
      insert into products (
        created_by, updated_by, submitted_by, name, brand, platform, category, sku, unit,
        price, cost, stock, image, description, tags, channels, status, deleted_at, updated_at
      )
      values (
        $1::uuid, $1::uuid, $1::uuid, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, null, $11, $12::jsonb, $13::jsonb, 'active', null, now()
      )
      on conflict (sku) do update set
        updated_by = excluded.updated_by,
        name = excluded.name,
        brand = excluded.brand,
        platform = excluded.platform,
        category = excluded.category,
        unit = excluded.unit,
        price = excluded.price,
        cost = excluded.cost,
        stock = excluded.stock,
        image = excluded.image,
        description = excluded.description,
        tags = excluded.tags,
        channels = excluded.channels,
        status = 'active',
        deleted_at = null,
        updated_at = now()
      `,
      [
        actorId,
        item.name,
        item.brand,
        item.platform,
        item.category,
        item.sku,
        item.unit,
        item.price,
        item.cost,
        item.stock,
        item.description,
        JSON.stringify(item.tags),
        JSON.stringify(["demo-seed"]),
      ]
    )
    upserted += 1
  }

  const count = await client.query("select count(*)::int as count from products where deleted_at is null")
  console.log(`Seeded ${upserted} demo products. Active product rows: ${count.rows[0]?.count ?? 0}`)
} finally {
  await client.end()
}

async function getActorId() {
  const result = await client.query(
    `select id::text from users where deleted_at is null order by case when role = 'admin' then 0 else 1 end, created_at asc limit 1`
  )
  return result.rows[0]?.id ?? "00000000-0000-0000-0000-000000000000"
}
