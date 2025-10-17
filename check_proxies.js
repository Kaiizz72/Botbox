// check_proxies.js
// Lọc & test SOCKS5/4 proxy, output proxies_ok.txt
const fs = require('fs')
const { SocksClient } = require('socks')

const input = process.argv[2] || 'socks5_clean.txt'
const targetHost = process.argv[3] || 'echomc.asia'
const targetPort = parseInt(process.argv[4] || '25565', 10)
const concurrency = parseInt(process.argv[5] || '25', 10)
const timeout = 7000
const outFile = 'proxies_ok.txt'

const proxies = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean)
console.log(`Loaded ${proxies.length} proxies from ${input}. Testing ${targetHost}:${targetPort}`)

let idx = 0
let ok = []

async function testOne(line) {
  const [host, portStr] = line.split(':')
  const port = Number(portStr || 0)
  if (!host || !port) return false
  try {
    const r = await SocksClient.createConnection({
      proxy: { host, port, type: input.includes('socks4') ? 4 : 5 },
      command: 'connect',
      destination: { host: targetHost, port: targetPort },
      timeout
    })
    try { r.socket.destroy() } catch (e) {}
    console.log(`[OK] ${line}`)
    ok.push(line)
    return true
  } catch (e) {
    return false
  }
}

async function worker() {
  while (true) {
    let i = idx++
    if (i >= proxies.length) break
    await testOne(proxies[i])
  }
}

;(async () => {
  const workers = []
  for (let i = 0; i < concurrency; i++) workers.push(worker())
  await Promise.all(workers)
  fs.writeFileSync(outFile, ok.join('\n'))
  console.log(`Done. ${ok.length} working proxies saved to ${outFile}`)
})()

