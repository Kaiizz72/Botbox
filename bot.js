const mineflayer = require('mineflayer')
const { SocksProxyAgent } = require('socks-proxy-agent')
const fs = require('fs')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalNear } = goals
const collectBlockPlugin = require('mineflayer-collectblock').plugin
const pvpPlugin = require('mineflayer-pvp').plugin

const SERVER_HOST = process.env.SERVER_HOST || 'echomc.asia'
const SERVER_PORT = Number(process.env.SERVER_PORT || 25565)
const AUTH_MODE = process.env.AUTH_MODE || 'offline'
const PASSWORD = process.env.BOT_PASS || '11qqaa22wwss'

let proxies = []
try {
  proxies = fs.readFileSync('proxies_ok.txt', 'utf8').split(/\r?\n/).filter(Boolean)
} catch (e) {
  console.log('⚠️ Không tìm thấy proxies_ok.txt, sẽ kết nối trực tiếp')
}

const BOT_NAMES = ["meosube"] // 1 bot test

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function spawnWithProxy(username, attempt = 0) {
  let agent = undefined
  if (proxies.length) {
    const proxy = pickRandom(proxies)
    const proxyUrl = `socks://${proxy}`
    agent = new SocksProxyAgent(proxyUrl)
    console.log(`[${username}] connect via ${proxyUrl} (attempt ${attempt + 1})`)
  } else {
    console.log(`[${username}] connect direct (no proxy)`)
  }

  const bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username,
    auth: AUTH_MODE,
    agent
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(collectBlockPlugin)
  bot.loadPlugin(pvpPlugin)

  let movement = null
  bot._loggedIn = false

  bot.once('spawn', () => {
    console.log(`[${username}] Spawned!`)
    const mcData = require('minecraft-data')(bot.version)
    movement = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movement)

    // auto /register + /login
    const regInt = setInterval(() => { if (!bot._loggedIn) bot.chat(`/register ${PASSWORD} ${PASSWORD}`) }, 6000)
    const logInt = setInterval(() => { if (!bot._loggedIn) bot.chat(`/login ${PASSWORD}`) }, 5000)

    bot.on('message', (msg) => {
      const t = msg.toString().toLowerCase()
      if (t.includes('welcome') || t.includes('successfully logged') || t.includes('you are now registered')) {
        console.log(`[${username}] login ok!`)
        bot._loggedIn = true
        clearInterval(regInt)
        clearInterval(logInt)
      }
    })

    setInterval(() => {
      if (!bot.entity || !bot._loggedIn) return
      randomWalk(bot, movement)
      if (Math.random() < 0.3) {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 400)
      }
    }, 4000)
  })

  bot.on('kicked', (r) => console.log(`[${username}] kicked:`, r.toString()))
  bot.on('end', () => {
    console.log(`[${username}] disconnected, retry...`)
    setTimeout(() => spawnWithProxy(username, attempt + 1), 8000)
  })
  bot.on('error', (err) => console.log(`[${username}] error:`, err.message))
}

function randomWalk(bot, move) {
  const dx = (Math.random() * 10 - 5) | 0
  const dz = (Math.random() * 10 - 5) | 0
  const p = bot.entity.position.offset(dx, 0, dz)
  bot.pathfinder.setMovements(move)
  bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2))
}

// chỉ spawn 1 bot test
spawnWithProxy(BOT_NAMES[0])
