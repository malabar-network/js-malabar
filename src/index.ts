import fs from 'fs'
import { NetworkInfo, Swarm } from './swarm'

// async function main() {
//   const bootstrapNode = await BootstrapNode.new({
//     listenAddresses: ['/ip4/127.0.0.1/tcp/10333'],
//   })

//   const bootstrapAddress = await bootstrapNode.start()
//   console.log('Bootstrap node: ' + bootstrapAddress.toString())

//   const nodes = await Promise.all(
//     new Array(NODE_COUNT).fill(undefined, 0, NODE_COUNT).map((_, index) =>
//       MalabarNode.new({
//         listenAddresses: ['/ip4/0.0.0.0/tcp/' + (index + 10334)],
//         bootstrapAddresses: [bootstrapAddress],
//         signer: Wallet.createRandom(),
//       })
//     )
//   )

//   console.log(`Spawned ${nodes.length} nodes`)

//   await Promise.all(nodes.map((node) => node.start()))

//   const names: Record<string, number> = {}

//   nodes.forEach((node, index) => {
//     names[node.getPeerId().toB58String()] = index
//   })

//   const links: { source: number; target: number }[] = []
//   let nodeCount = 0

//   nodes.forEach((node, index) => {
//     node.events.on('connection', (remoteAddr) => {
//       // console.log(`Node ${index} connected to ${remoteAddr}`)
//     })

//     node.events.on('messageTransport', (peer) => {
//       links.push({ source: names[peer.toB58String()], target: index })

//       nodeCount++

//       if (nodeCount >= NODE_COUNT - 1) {
//         fs.writeFileSync(
//           './nodes.json',
//           JSON.stringify({
//             nodes: Object.keys(names).map((_, index) => ({
//               name: `Node ${index}`,
//             })),
//             links,
//           })
//         )

//         process.exit(0)
//       }
//     })

//     node.events.on('ready', async () => {
//       // console.log(`Node ${index} ready`)
//       const address = await node.getAddress()

//       if (index === 0) {
//         const { poe, nonce: poeNonce } = solveProofOfEntry(address)

//         const msg = expandMessage({
//           from: address,
//           to: address,
//           poe,
//           poeNonce,
//           maxGas: 1000,
//           body: Buffer.from('Hello world!'),
//         })

//         await node.sendMessage(msg)
//         console.log('Sent message')
//       }
//     })
//   })
// }

function saveVisualizationFile(filename: string, data: NetworkInfo) {
  fs.writeFileSync(
    `tools/network-visualization/data/${filename}.json`,
    JSON.stringify(data)
  )
  console.log(`Saved ${filename}.json`)
}

async function main() {
  const swarm = await Swarm.new()
  await swarm.createNodes({ count: 20 })

  swarm.on('ready', () => {
    console.log('Network ready')

    const network = swarm.getNetworkInfo()
    saveVisualizationFile('network', network)
  })

  await swarm.startNodes()
}

main().catch(console.error)
