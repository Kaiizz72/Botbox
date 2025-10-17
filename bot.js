// bot.js — spawn nhiều bot, auto register/login, chơi mãi mãi
const mineflayer = require('mineflayer')
const { SocksProxyAgent } = require('socks-proxy-agent')
const fs = require('fs')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalNear } = goals
const collectBlockPlugin = require('mineflayer-collectblock').plugin
const pvpPlugin = require('mineflayer-pvp').plugin

// ====== CONFIG ======
const SERVER_HOST = process.env.SERVER_HOST || 'per10.asaka.asia'
const SERVER_PORT = Number(process.env.SERVER_PORT || 30060)
const AUTH_MODE = process.env.AUTH_MODE || 'offline'
const PASSWORD = process.env.BOT_PASS || '11qqaa22wwss'
const JOIN_INTERVAL_MS = Number(process.env.JOIN_INTERVAL_MS || 10000) // 40s giữa mỗi bot
const MAX_RETRY_BACKOFF = Number(process.env.MAX_RETRY_BACKOFF || 5 * 60 * 1000) // max 5 phút backoff

// load proxies_ok nếu có
let proxies = []
try {
  proxies = fs.readFileSync('proxies_ok.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!proxies.length) proxies = []
} catch (e) {
  proxies = []
}

// 100 tên bot (ví dụ)
const BOT_NAMES = [
  "nguyenphi","meosmmy","kairon82","trananh","lethao","hoangcuong","duyphat","minhquan","thanhhuyen","linhchi",
  "quanghuy","hoangnam","ngocanh","tuananh","thanhdat","thuytrang","minhtam","khanhlinh","hoanganh","ngocbao",
  "trangpham","phuongnam","nguyenhoa","dinhphuc","huonggiang","lephuong","thanhson","vietanh","ngocmai","thienan",
  "huynhnhu","thienkim","quynhtrang","khanhduy","mydung","baokhanh","phuonganh","kimngan","trungkien","thanhngan",
  "dieulinh","kimanh","ngocquyen","thuthao","hoailinh","quocbao","phuonguyen","kimngoc","nguyenthinh","nhatlinh",
  "thuytien","tranphu","thanhtruc","hanhnguyen","namphuong","thuydung","nguyetanh","giahan","minhhoang","diepanh",
  "nguyenthuy","huyentrang","thienphu","duyminh","lethinh","baoan","giabao","hongson","trungkhoa","ngocson",
  "hoangphuong","baolong","khactuan","thanhhuy","quocviet","ngocduy","hoailam","kimlong","nhatminh","hongan",
  "kimthoa","thienlong","quynhmai","hoangdung","kimkhanh","lehong","thuykieu","thienbao","diephuong","trungkhang",
  "kimphuong","huyhoang","ngoclan","kimyen","hoanglam","nguyenquan","thutrang","tuanvu","minhchau","nguyenhai"
]

// helper
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// spawn with proxy (or direct)
function spawnWithProxy(username, attempt = 0) {
  const backoff = Math.min(1000 * (Math.pow(1.8, Math.min(attempt, 8))), MAX_RETRY_BACKOFF) // exponential-ish capped
  let agent = undefined
  if (proxies.length) {
    const proxy = pickRandom(proxies)
    const proxyUrl = proxy.startsWith('socks://') ? proxy : `socks://${proxy}`
    try { agent = new SocksProxyAgent(proxyUrl) } catch (e) { agent = undefined }
    console.log(`[${username}] attempt=${attempt+1} proxy=${proxy || 'direct'}`)
  } else {
    console.log(`[${username}] attempt=${attempt+1} (no proxy, direct connect)`)
  }

  const bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username,
    auth: AUTH_MODE,
    agent,
    version:'1.20.4'
  })

  // load plugins safely
  try { bot.loadPlugin(pathfinder) } catch (e) {}
  try { bot.loadPlugin(collectBlockPlugin) } catch (e) {}
  try { bot.loadPlugin(pvpPlugin) } catch (e) {}

  let movement = null
  bot._loggedIn = false
  bot._registerAttempts = 0
  bot._loginAttempts = 0
  let regInterval = null, logInterval = null, behaviorInterval = null

  // detect text / messages (to decide when to register/login)
  function handleMessage(msg) {
    try {
      const full = msg.toString()
      const text = full.toLowerCase()
      // detect prompts asking to register/login
      if (!bot._loggedIn) {
        if (text.includes('please register') || text.includes('type /register') || text.includes('you must register')) {
          safeChat(bot, `/register ${PASSWORD} ${PASSWORD}`)
        }
        if (text.includes('please login') || text.includes('type /login') || text.includes('you must login')) {
          safeChat(bot, `/login ${PASSWORD}`)
        }
        // detect login/register success heuristics
        if (text.includes('welcome') || text.includes('login successful') || text.includes('successfully logged') ||
            text.includes('you are now registered') || text.includes('you have been registered')) {
          console.log(`[${username}] detected login/register success message`)
          bot._loggedIn = true
          // clear intervals
          if (regInterval) { clearInterval(regInterval); regInterval = null }
          if (logInterval) { clearInterval(logInterval); logInterval = null }
        }
      }
    } catch (e) {}
  }

  // safe chat (catch errors)
  function safeChat(bot, txt) {
    try { bot.chat(txt) } catch (e) {}
  }

  bot.once('spawn', () => {
    console.log(`[${username}] spawned (version=${bot.version || 'unknown'})`)
    try {
      const mcData = require('minecraft-data')(bot.version)
      movement = new Movements(bot, mcData)
      bot.pathfinder.setMovements(movement)
    } catch (e) {
      console.log(`[${username}] cannot load minecraft-data for version:`, e.message || e)
    }

    // fallback: try send register/login periodically until logged in or killed
    regInterval = setInterval(() => {
      if (bot._loggedIn) return
      bot._registerAttempts = (bot._registerAttempts || 0) + 1
      safeChat(bot, `/register ${PASSWORD} ${PASSWORD}`)
    }, 8000)

    // send login a bit sooner and more often
    logInterval = setInterval(() => {
      if (bot._loggedIn) return
      bot._loginAttempts = (bot._loginAttempts || 0) + 1
      safeChat(bot, `/login ${PASSWORD}`)
    }, 6000)

    // small greeting once
    setTimeout(() => safeChat(bot, 'xin chào!'), 7000)

    // attach message handler
    bot.on('message', handleMessage)
    bot.on('chat', (usernameFrom, message) => {
      // optional: debug player chat in server
      // console.log(`[${username}] chat from ${usernameFrom}: ${message}`)
    })

    // behavior loop: only active after logged in
    behaviorInterval = setInterval(async () => {
      try {
        if (!bot.entity || !bot._loggedIn) return
        // attack if player near
        const enemy = nearestPlayer(bot, 6)
        if (enemy) {
          try {
            if (bot.pvp && bot.pvp.attack) {
              await bot.pvp.attack(enemy)
            } else {
              await approachEntity(bot, movement, enemy, 2)
            }
            if (Math.random() < 0.2) safeChat(bot, 'choi di!')
          } catch (e) {}
          return
        }
        // else random walk + occasional jump
        randomWalk(bot, movement)
        if (Math.random() < 0.2) {
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 500 + Math.random() * 800)
        }
      } catch (e) {}
    }, 3000)
  })

  bot.on('kicked', (reason) => {
    try {
      const r = reason && reason.toString ? reason.toString() : String(reason)
      console.log(`[${username}] kicked: ${r}`)
    } catch (e) {}
  })

  bot.on('error', (err) => {
    console.log(`[${username}] error:`, err && err.message ? err.message : err)
  })

  bot.on('end', async () => {
    console.log(`[${username}] connection ended — scheduling retry in ${Math.round(backoff/1000)}s`)
    // cleanup
    try { if (regInterval) clearInterval(regInterval) } catch (e) {}
    try { if (logInterval) clearInterval(logInterval) } catch (e) {}
    try { if (behaviorInterval) clearInterval(behaviorInterval) } catch (e) {}
    bot.removeAllListeners && bot.removeAllListeners('message')
    // wait backoff then respawn with attempt+1
    await wait(backoff + Math.floor(Math.random() * 5000))
    spawnWithProxy(username, attempt + 1)
  })
}

// helper behavior funcs
function nearestPlayer(bot, radius) {
  try {
    let best = null, bestDist = Infinity
    for (const id in bot.entities) {
      const e = bot.entities[id]
      if (!e) continue
      if (e.type === 'player' && e.username && e.username !== bot.username) {
        const d = bot.entity.position.distanceTo(e.position)
        if (d <= radius && d < bestDist) { best = e; bestDist = d }
      }
    }
    return best
  } catch (e) { return null }
}

async function approachEntity(bot, move, entity, dist = 2) {
  try {
    const g = new GoalNear(entity.position.x, entity.position.y, entity.position.z, dist)
    bot.pathfinder.setMovements(move)
    bot.pathfinder.setGoal(g, true)
    await wait(1200)
  } catch (e) {}
}

function randomWalk(bot, move) {
  try {
    const dx = ((Math.random() * 20) - 10) | 0
    const dz = ((Math.random() * 20) - 10) | 0
    const p = bot.entity.position.offset(dx, 0, dz)
    bot.pathfinder.setMovements(move)
    bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2))
    if (Math.random() < 0.25) {
      bot.setControlState('sprint', true)
      setTimeout(() => bot.setControlState('sprint', false), 1500 + Math.random() * 1800)
    }
  } catch (e) {}
}

// spawn all bots with delay between each to avoid anti-bot
;(async () => {
  console.log(`Spawning ${BOT_NAMES.length} bots — interval ${JOIN_INTERVAL_MS}ms`)
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const name = BOT_NAMES[i]
    setTimeout(() => {
      try { spawnWithProxy(name, 0) } catch (e) { console.log('spawn err', e) }
    }, i * JOIN_INTERVAL_MS)
  }
})()
    
