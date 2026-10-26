// Cloudflare Workers 部署前准备（供 .github/workflows/deploy-cloudflare.yml 使用，本地也可运行）
//
// 1. D1：wrangler.jsonc 里 database_id 还是占位符时，按 database_name 查找远程数据库，
//    不存在则自动创建，并把真实 ID 写回 wrangler.jsonc（只改 CI 工作区，不会提交回仓库）
// 2. R2：见 ensureR2
// 3. VAULT_KEY：仅当 Worker 上还没有这个 secret 时（首次部署），把环境变量 VAULT_KEY
//    写成 secrets 文件交给 `wrangler deploy --secrets-file`。已存在时绝不覆盖——
//    更换 VAULT_KEY 会导致已保存的密码全部无法解密。
// 4. VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY（浏览器推送）：没有时自动生成，同样随部署上传，之后不再变化
//
// 需要环境变量：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID；首次部署还需要 VAULT_KEY
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import process from 'node:process'

const CONFIG = 'wrangler.jsonc'
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'
const SECRETS_FILE = path.resolve('.cf-secrets.json')

const WRANGLER_BIN = path.resolve('node_modules/wrangler/bin/wrangler.js')

/** 直接用 node 运行项目内的 wrangler，不依赖全局 pnpm / npx */
function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

/** 写入 GitHub Actions 的 step 输出 */
function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

function readField(config, field) {
  return config.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`))?.[1]
}

function findDatabase(name) {
  let list
  try {
    list = JSON.parse(wrangler(['d1', 'list', '--json']))
  }
  catch (e) {
    fail(`查询 D1 数据库失败，请检查 API Token 权限与账户 ID：${`${e.stderr || ''}`.trim() || e.message}`)
  }
  return list.find(db => db.name === name)
}

function ensureD1() {
  let config = fs.readFileSync(CONFIG, 'utf8')
  const name = readField(config, 'database_name')
  const id = readField(config, 'database_id')
  if (!name)
    fail(`${CONFIG} 中没有找到 database_name`)
  if (id && id !== PLACEHOLDER_ID) {
    console.log(`D1：使用 ${CONFIG} 中已配置的数据库 ${name} (${id})`)
    return
  }

  let db = findDatabase(name)
  if (!db) {
    console.log(`D1：远程不存在数据库 ${name}，正在创建…`)
    wrangler(['d1', 'create', name])
    db = findDatabase(name)
    if (!db)
      fail(`创建 D1 数据库 ${name} 后仍然查不到，请检查 API Token 是否有 D1 编辑权限`)
  }
  config = config.replace(PLACEHOLDER_ID, db.uuid)
  fs.writeFileSync(CONFIG, config)
  console.log(`D1：使用数据库 ${name} (${db.uuid})`)
}

/** 旧版本对整个存储桶生效的规则（文件最长 7 天时设置），支持 30 天 / 永久后需要删掉 */
const LEGACY_LIFECYCLE_RULE = 'expire-after-8-days'
/** 有效期不超过 31 天的文件放在 tmp/ 前缀下（见 worker/src/files.ts 的 objectKey），32 天后自动删除 */
const LIFECYCLE_RULE = 'tmp-expire-after-32-days'
const LIFECYCLE_PREFIX = 'tmp/'
const LIFECYCLE_DAYS = '32'

/** 去掉 R2 绑定（只改 CI 工作区），文件快传接口会提示未开通 */
function dropR2Binding(reason) {
  const config = fs.readFileSync(CONFIG, 'utf8')
  fs.writeFileSync(CONFIG, config.replace(/\s*"r2_buckets"\s*:\s*\[[\s\S]*?\],/, ''))
  console.log(`::warning::文件快传不可用：${reason}。本次部署不绑定 R2，其余功能不受影响`)
}

/**
 * 3. R2：存储桶不存在时自动创建，并给 tmp/ 前缀加一条「32 天后自动删除」的生命周期规则，
 *    作为定时清理之外的兜底（tmp/ 下的文件有效期最长 31 天；更长或永久的文件在 keep/ 下，不自动删除）。
 *    账户未开通 R2 或 Token 没有 R2 权限时不阻断部署。
 */
function ensureR2() {
  const config = fs.readFileSync(CONFIG, 'utf8')
  const bucket = readField(config, 'bucket_name')
  if (!bucket)
    return
  const output = e => `${e.stdout || ''}${e.stderr || ''}`.trim() || e.message
  try {
    wrangler(['r2', 'bucket', 'info', bucket])
    console.log(`R2：使用存储桶 ${bucket}`)
  }
  catch {
    try {
      wrangler(['r2', 'bucket', 'create', bucket])
      console.log(`R2：已创建存储桶 ${bucket}`)
    }
    catch (e) {
      const msg = output(e)
      if (/10042|enable R2/i.test(msg))
        return dropR2Binding('账户尚未开通 R2，请在 Cloudflare 控制台 R2 页面开通（免费额度 10 GB）后重新部署')
      return dropR2Binding(`无法创建 R2 存储桶（请确认 API Token 有 Workers R2 Storage 编辑权限）：${msg.split('\n').slice(-3).join(' ')}`)
    }
  }
  try {
    const rules = wrangler(['r2', 'bucket', 'lifecycle', 'list', bucket])
    // 旧规则会把 30 天 / 永久的文件提前删掉，必须先移除
    if (rules.includes(LEGACY_LIFECYCLE_RULE)) {
      wrangler(['r2', 'bucket', 'lifecycle', 'remove', bucket, '--name', LEGACY_LIFECYCLE_RULE])
      console.log(`R2：已移除旧的生命周期规则 ${LEGACY_LIFECYCLE_RULE}`)
    }
    if (!rules.includes(LIFECYCLE_RULE)) {
      wrangler(['r2', 'bucket', 'lifecycle', 'add', bucket, LIFECYCLE_RULE, LIFECYCLE_PREFIX, '--expire-days', LIFECYCLE_DAYS, '--force'])
      console.log(`R2：已添加生命周期规则（${LIFECYCLE_PREFIX} 下的对象 ${LIFECYCLE_DAYS} 天后自动删除）`)
    }
  }
  catch (e) {
    // 规则只是兜底，失败不影响部署
    console.log(`::warning::设置 R2 生命周期规则失败：${output(e).split('\n').slice(-2).join(' ')}`)
  }
}

/** Worker 上已有的 secret 名称 */
function existingSecrets() {
  try {
    const secrets = JSON.parse(wrangler(['secret', 'list', '--format', 'json']))
    return new Set(secrets.map(s => s.name))
  }
  catch (e) {
    const output = `${e.stdout || ''}${e.stderr || ''}`
    // 首次部署时 Worker 还不存在，视为没有 secret；其他错误（如权限不足）直接失败，
    // 避免误判为「没有」而用新的 VAULT_KEY 覆盖掉旧的
    if (/10007|does not exist|not found/i.test(output))
      return new Set()
    fail(`读取 Worker secrets 失败：${output.trim() || e.message}`)
  }
}

/** 浏览器推送用的 VAPID 密钥对：私钥为 JWK（JSON），公钥为未压缩点的 base64url */
function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])
  return { VAPID_PRIVATE_KEY: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }), VAPID_PUBLIC_KEY: pub.toString('base64url') }
}

function prepareSecrets() {
  const existing = existingSecrets()
  const secrets = {}
  // VAPID：没有就自动生成（之后保持不变，否则已订阅的浏览器会收不到推送）
  if (!existing.has('VAPID_PRIVATE_KEY') || !existing.has('VAPID_PUBLIC_KEY')) {
    Object.assign(secrets, generateVapidKeys())
    console.log('VAPID：首次部署，已生成浏览器推送密钥')
  }
  else {
    console.log('VAPID：Worker 上已存在，保持不变')
  }
  if (existing.has('VAULT_KEY')) {
    console.log('VAULT_KEY：Worker 上已存在，保持不变')
    writeSecrets(secrets)
    return
  }
  const key = process.env.VAULT_KEY?.trim()
  if (!key)
    fail('首次部署需要 VAULT_KEY：请在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加 VAULT_KEY（base64 编码的 32 字节随机数）')
  let bytes = 0
  try {
    bytes = Buffer.from(key, 'base64').length
  }
  catch {}
  if (bytes < 32)
    fail('VAULT_KEY 格式不正确：需要 base64 编码的 32 字节随机数')

  secrets.VAULT_KEY = key
  writeSecrets(secrets)
  console.log('VAULT_KEY：首次部署，将随本次部署一起设置')
}

/** 需要设置的 secret 写成文件，随 wrangler deploy --secrets-file 一起上传（只增不删） */
function writeSecrets(secrets) {
  if (!Object.keys(secrets).length)
    return
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets), { mode: 0o600 })
  setOutput('secrets_file', SECRETS_FILE)
}

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  fail('缺少 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID')

ensureD1()
ensureR2()
prepareSecrets()
