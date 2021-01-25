import fs from 'fs'
import { NetworkInfo, Swarm } from './swarm'

function saveVisualizationFile(filename: string, data: NetworkInfo) {
  fs.writeFileSync(
    `tools/network-visualization/data/${filename}.json`,
    JSON.stringify(data)
  )
  console.log(`Saved ${filename}.json`)
}

async function main() {
  const swarm = await Swarm.new()

  swarm.on('ready', async () => {
    console.log('Network ready')

    const network = swarm.getNetworkInfo()
    saveVisualizationFile('network', network)

    await swarm.sendMessage(Buffer.from('Hello', 'ascii'))
  })

  await swarm.createNodes({ count: 60 })
  await swarm.startNodes()
  console.log('Waiting for nodes to be ready...')
}

main().catch(console.error)
