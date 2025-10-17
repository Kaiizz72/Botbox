// bot.js
const mineflayer = require('mineflayer')
const { SocksProxyAgent } = require('socks-proxy-agent')
const fs = require('fs')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalNear } = goals
const collectBlockPlugin = require('mineflayer-collectblock').plugin
const pvpPlugin = require('mineflayer-pvp').plugin

const SERVER_HOST = process.env.SERVER_HOST || 'echomc.asia'
const SERVER_PORT = Number(process.env.SERVER_PORT || 25565)
const AUTH_MODE   = process.env.AUTH_MODE || 'offline'
const PASSWORD    = process.env.BOT_PASS || '11qqaa22wwss'

const proxies = [
  ...fs.readFileSync('SOCKS5_proxy.txt','utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
  ...fs.readFileSync('SOCKS4_proxy.txt','utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
]

if (!proxies.length) {
  console.error('Không tìm thấy proxy')
  process.exit(1)
}

const BOT_NAMES = [
  "meosube","nguyenphi","trananh","lethao","hoangcuong","duyphat","minhquan","thanhhuyen","linhchi","quanghuy",
  "hoangnam","ngocanh","tuananh","thanhdat","thuytrang","minhtam","khanhlinh","hoanganh","ngocbao","trangpham"
]

function randInt(max){ return Math.floor(Math.random()*max) }
function pickRandom(arr){ return arr[randInt(arr.length)] }

function chooseProxy(){ return pickRandom(proxies) }

function spawnWithProxy(username, attempt = 0) {
  const proxyString = chooseProxy()
  const proxyUrl = `socks://${proxyString}`
  const agent = new SocksProxyAgent(proxyUrl)
  console.log(`[${username}] Kết nối qua proxy ${proxyUrl} (lần ${attempt+1})`)

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

  bot.once('spawn', () => {
    console.log(`[${username}] Spawned!`)
    const mcData = require('minecraft-data')(bot.version)
    movement = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movement)

    // spam register/login tới khi thành công
    const regInt = setInterval(()=>{ try{ bot.chat(`/register ${PASSWORD} ${PASSWORD}`) }catch{} }, 5000)
    const logInt = setInterval(()=>{ try{ bot.chat(`/login ${PASSWORD}`) }catch{} }, 4000)
    setTimeout(()=>{ bot.chat("xin chào server!") }, 7000)

    bot.on('message', msg => {
      const txt = msg.toString().toLowerCase()
      if (txt.includes('welcome') || txt.includes('login') || txt.includes('register')){
        clearInterval(regInt); clearInterval(logInt);
      }
    })

    // loop hành vi: đánh người gần hoặc đi dạo
    setInterval(async ()=>{
      if (!bot.entity) return
      const enemy = nearestPlayer(bot, 6)
      if (enemy){
        try{ await bot.pvp.attack(enemy) }catch{}
      } else {
        randomWalk(bot, movement)
        if (Math.random()<0.3){ bot.setControlState('jump',true); setTimeout(()=>bot.setControlState('jump',false),500) }
      }
    }, 4000)
  })

  bot.on('end', ()=>{
    console.log(`[${username}] Disconnected, retry...`)
    setTimeout(()=>spawnWithProxy(username, attempt+1), 5000)
  })

  bot.on('error', (err)=>{
    console.log(`[${username}] Error:`, err.message)
  })
}

function nearestPlayer(bot, radius){
  let best=null, bestDist=9999
  for (const e of Object.values(bot.entities)){
    if (e.type==='player' && e.username!==bot.username){
      const d=bot.entity.position.distanceTo(e.position)
      if (d<bestDist && d<=radius){ best=e; bestDist=d }
    }
  }
  return best
}

function randomWalk(bot, move){
  const dx=(Math.random()*10-5)|0
  const dz=(Math.random()*10-5)|0
  const p=bot.entity.position.offset(dx,0,dz)
  bot.pathfinder.setMovements(move)
  bot.pathfinder.setGoal(new GoalNear(p.x,p.y,p.z,2))
}

// spawn 20 bot
BOT_NAMES.forEach((name,i)=>{
  setTimeout(()=>spawnWithProxy(name), i*10000)
})
