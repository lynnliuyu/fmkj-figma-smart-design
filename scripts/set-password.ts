/**
 * 自托管服务器：创建首个后台管理员，或给员工/管理员设置新密码。
 *
 *   NEW_PASSWORD='...' pnpm exec payload run --input '{"scriptPath":"scripts/set-password.ts","scriptArgs":["admins","you@example.com"]}'
 *   NEW_PASSWORD='...' pnpm exec payload run --input '{"scriptPath":"scripts/set-password.ts","scriptArgs":["users","staff@example.com"]}'
 *
 * admins：邮箱不存在时自动创建（用于第一次登录 /admin）。
 * users：只给已存在的员工改密码（员工从 Figma 迁移过来后需要逐个设置）。
 * 密码从环境变量读取，不出现在命令参数里。
 */
import path from 'node:path'
import { getPayload } from 'payload'

const [collection, email] = process.argv.slice(2)
const password = process.env.NEW_PASSWORD
if ((collection !== 'admins' && collection !== 'users') || !email || !password) {
  console.error(
    '用法：NEW_PASSWORD=新密码 payload run scripts/set-password.ts <admins|users> <邮箱>',
  )
  process.exit(1)
}
if (password.length < 6) {
  console.error('密码至少 6 位')
  process.exit(1)
}

const configPath = path.resolve(process.env.PAYLOAD_CONFIG_PATH || 'src/payload.selfhost.config.ts')
const payload = await getPayload({ config: (await import(configPath)).default })
if (payload.db.name !== 'postgres') {
  console.error(`当前连接的数据库是 ${payload.db.name}，不是自托管 PostgreSQL，已停止。`)
  process.exit(1)
}

const found = await payload.find({
  collection,
  where: { email: { equals: email } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})
if (found.docs.length) {
  await payload.update({
    collection,
    id: found.docs[0].id,
    data: {
      password,
      lockUntil: null,
      loginAttempts: 0,
      ...(collection === 'users' ? { status: 'active' } : {}),
    } as never,
    overrideAccess: true,
  })
  console.log(`已更新 ${collection} 密码：${email}`)
} else if (collection === 'admins') {
  await payload.create({ collection, data: { email, password } as never, overrideAccess: true })
  console.log(`已创建后台管理员：${email}`)
} else {
  const name = email.split('@')[0] || '成员'
  await payload.create({
    collection: 'users',
    data: { name, email, password, status: 'active' } as never,
    overrideAccess: true,
  })
  console.log(`已创建并启用员工账号：${email}`)
}
process.exit(0)
