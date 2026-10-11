// Cloudflare Workers 部署前准备（供 .github/workflows/deploy-cloudflare.yml 使用，本地也可运行）
//
// 1. D1：wrangler.jsonc 里 database_id 还是占位符时，按 database_name 查找远程数据库，
//    不存在则自动创建，并把真实 ID 写回 wrangler.jsonc（只改 CI 工作区，不会提交回仓库）
// 2. VAULT_KEY：仅当 Worker 上还没有这个 secret 时（首次部署），把环境变量 VAULT_KEY
//    写成 secrets 文件交给 `wrangler deploy --secrets-file`。已存在时绝不覆盖——
//    更换 VAULT_KEY 会导致已保存的密码全部无法解密。
//
// 需要环境变量：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID；首次部署还需要 VAULT_KEY
import { execFileSync } from 'node:child_process'
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

function hasVaultKey() {
  try {
    const secrets = JSON.parse(wrangler(['secret', 'list', '--format', 'json']))
    return secrets.some(s => s.name === 'VAULT_KEY')
  }
  catch (e) {
    const output = `${e.stdout || ''}${e.stderr || ''}`
    // 首次部署时 Worker 还不存在，视为没有 secret；其他错误（如权限不足）直接失败，
    // 避免误判为「没有」而用新的 VAULT_KEY 覆盖掉旧的
    if (/10007|does not exist|not found/i.test(output))
      return false
    fail(`读取 Worker secrets 失败：${output.trim() || e.message}`)
  }
}

function prepareSecrets() {
  if (hasVaultKey()) {
    console.log('VAULT_KEY：Worker 上已存在，保持不变')
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

  fs.writeFileSync(SECRETS_FILE, JSON.stringify({ VAULT_KEY: key }), { mode: 0o600 })
  setOutput('secrets_file', SECRETS_FILE)
  console.log('VAULT_KEY：首次部署，将随本次部署一起设置')
}

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  fail('缺少 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID')

ensureD1()
prepareSecrets()
